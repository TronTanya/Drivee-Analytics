"""Insight text generation service (LLM-first with deterministic fallback)."""

from __future__ import annotations

import math
import re
from typing import Any, Optional

from app.services.llm.llm_service import LLMService

_TIME_COL = re.compile(
    r"(^|_)(bucket|week|month|day|date|time|ts|at)$|_date$|_at$|^date_|^datetime|день",
    re.IGNORECASE,
)
_CITY_DIM = re.compile(r"city|region|област|город|segment|channel|категор", re.IGNORECASE)
_CANCEL_METRIC = re.compile(r"cancel|отмен", re.IGNORECASE)
_ACCEPT_METRIC = re.compile(r"accept|driveraccept|принят", re.IGNORECASE)
_SHARE_HINT = re.compile(r"share|percent|ratio|conversion|дол", re.IGNORECASE)
_ID_DIM_COL = re.compile(
    r"^(city_id|order_id|user_id|driver_id|tender_id|offset_hours|status_order|status_tender|id|rn|row_number)$",
    re.IGNORECASE,
)

_EMPTY_ROWS_INSIGHT_RU = (
    "Результат SQL пустой (0 строк), поэтому числовой инсайт построить нельзя. "
    "Типично так бывает из‑за окна по датам (например, последние недели не пересекаются с `order_timestamp` в выгрузке), "
    "узких фильтров (город, канал) или отсутствия строк под запрос. Сверьте ячейку «Таблица» и SQL выше."
)


def _to_float(v: Any) -> Optional[float]:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and v.strip():
        try:
            return float(v.strip().replace(",", "."))
        except ValueError:
            return None
    return None


def _col_numeric_ratio(col: str, rows: list[dict[str, Any]], sample: int = 40) -> float:
    found = 0
    ok = 0
    for r in rows[:sample]:
        if col not in r:
            continue
        found += 1
        if _to_float(r.get(col)) is not None:
            ok += 1
    if found == 0:
        return 0.0
    return ok / found


def _pick_metric_column(columns: list[str], rows: list[dict[str, Any]]) -> Optional[str]:
    """Первая в основном числовая колонка, похожая на метрику (не сырой id ряда)."""
    skip = {"id", "row_number", "rn"}
    scored: list[tuple[float, int, str]] = []
    for i, c in enumerate(columns):
        lc = c.lower()
        if lc in skip:
            continue
        ratio = _col_numeric_ratio(c, rows)
        if ratio < 0.55:
            continue
        bonus = 2 if _CANCEL_METRIC.search(c) else 0
        bonus += 1 if any(x in lc for x in ("revenue", "orders", "count", "value", "metric", "amount")) else 0
        scored.append((ratio + bonus * 0.05, -i, c))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][2]


def _pick_time_column(columns: list[str]) -> Optional[str]:
    for c in columns:
        if _TIME_COL.search(c):
            return c
    return None


def _pick_dimension_column(columns: list[str], metric: Optional[str], rows: list[dict[str, Any]]) -> Optional[str]:
    for c in columns:
        if c == metric:
            continue
        if _CITY_DIM.search(c):
            return c
    for c in columns:
        if c == metric:
            continue
        if _TIME_COL.search(c):
            continue
        if _col_numeric_ratio(c, rows) < 0.45:
            return c
    return None


def _is_structural_column(name: str) -> bool:
    """Колонки-измерения / id: не показываем как отдельную «метрику» в сводке."""
    if _ID_DIM_COL.match(name.strip()):
        return True
    if _TIME_COL.search(name):
        return True
    return False


def _metrics_from_single_row(row: dict[str, Any], columns: list[str]) -> list[tuple[str, float]]:
    """Числовые показатели одной строки результата (для сводки «два значения»)."""
    out: list[tuple[str, float]] = []
    for c in columns:
        if _is_structural_column(c):
            continue
        raw = row.get(c)
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            continue
        v = _to_float(raw)
        if v is None and isinstance(raw, (int, float)) and not isinstance(raw, bool):
            v = float(raw)
        if v is None:
            continue
        out.append((c, float(v)))
    return out


def _ru_metric_phrase(column: str) -> str:
    lo = column.lower()
    if _ACCEPT_METRIC.search(lo):
        return "принятые заказы"
    if _CANCEL_METRIC.search(lo):
        return "отменённые заказы"
    if "done" in lo or "заверш" in lo:
        return "завершённые поездки"
    if any(x in lo for x in ("orders_count", "order_cnt", "num_orders")):
        return "заказы (агрегат)"
    return f"показатель «{column}»"


def _format_metric_value(v: float) -> str:
    if abs(v - round(v)) < 1e-6 and abs(v) < 1e12:
        return str(int(round(v)))
    return f"{v:.4g}"


def _single_row_multi_metric_insight(rows: list[dict[str, Any]], columns: list[str]) -> Optional[str]:
    """
    Одна строка с двумя и более числовыми метриками (типично: принятые + отмены по городу).
    Даём явный текст, чтобы LLM не свёл ответ к одной «ед.».
    """
    if len(rows) != 1:
        return None
    metrics = _metrics_from_single_row(rows[0], columns)
    if len(metrics) < 2:
        return None
    row = rows[0]
    city = row.get("city_id") or row.get("city")
    prefix = f"По city_id {city}: " if city not in (None, "") else ""

    def _sort_key(item: tuple[str, float]) -> tuple[int, str]:
        col, _ = item
        lo = col.lower()
        if _ACCEPT_METRIC.search(lo):
            return (0, col)
        if _CANCEL_METRIC.search(lo):
            return (1, col)
        return (2, col)

    ordered = sorted(metrics, key=_sort_key)
    parts = [f"{_ru_metric_phrase(c)} — {_format_metric_value(v)}" for c, v in ordered]
    return prefix + "; ".join(parts) + "."


def _row_label(row: dict[str, Any], dim: Optional[str], columns: list[str]) -> str:
    if dim and dim in row:
        return str(row.get(dim) or "—")
    for c in columns:
        if c == dim:
            continue
        v = row.get(c)
        if v is not None and not isinstance(v, (int, float)):
            return str(v)[:80]
    return str(row)[:120]


class InsightGenerationService:
    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service

    def generate(self, intent: str, rows: list[dict[str, Any]], columns: list[str]) -> str:
        # Пустой результат: не зовём LLM — иначе модель пишет общие фразы вроде «данные пусты», без привязки к SQL/фильтрам.
        if not rows:
            return _EMPTY_ROWS_INSIGHT_RU
        forced = _single_row_multi_metric_insight(rows, columns)
        if forced is not None:
            return forced
        if self._llm is not None and self._llm.is_enabled:
            llm = self._llm.generate_insight_text(intent=intent, columns=columns, rows=rows)
            if llm is not None and llm.insight_text.strip():
                title = llm.insight_title.strip()
                if title:
                    return f"{title}: {llm.insight_text.strip()}"
                return llm.insight_text.strip()
        return self._fallback(intent, rows, columns)

    @staticmethod
    def _fallback(intent: str, rows: list[dict[str, Any]], columns: list[str]) -> str:
        if not rows:
            return _EMPTY_ROWS_INSIGHT_RU
        metric = _pick_metric_column(columns, rows)
        tcol = _pick_time_column(columns)
        dim = _pick_dimension_column(columns, metric, rows)

        # --- Явные схемы summary / ranking с dim+value ---
        if intent == "summary" and "value" in rows[0]:
            v = rows[0].get("value")
            return f"Итоговое значение метрики: {v}."

        if intent == "ranking" and "value" in rows[0] and ("dim" in rows[0] or dim):
            top = rows[0]
            label = top.get("dim") if "dim" in top else _row_label(top, dim, columns)
            return f"Лидер рейтинга: {label} — значение {top.get('value')}."

        # --- Доли / структура ---
        if intent == "share" or (metric and _SHARE_HINT.search(metric)):
            if metric:
                vals = [_to_float(r.get(metric)) for r in rows]
                vals = [v for v in vals if v is not None]
                if vals and sum(vals) > 0:
                    total = sum(vals)
                    shares = [(i, v / total) for i, v in enumerate(vals)]
                    shares.sort(key=lambda x: -x[1])
                    best_i, best_s = shares[0]
                    label = _row_label(rows[best_i], dim, columns)
                    return (
                        f"Крупнейшая доля у «{label}»: около {best_s * 100:.1f}% от суммы метрики по строкам результата; "
                        f"сегментов в выборке: {len(rows)}."
                    )
            return "Доли по сегментам рассчитаны; сравните сегменты по величине метрики в таблице."

        # --- Динамика / рост–падение ---
        if intent in ("trend", "forecast") or tcol:
            m = metric or _pick_metric_column(columns, rows)
            if tcol and m:
                indexed = [(str(r.get(tcol) or ""), _to_float(r.get(m)), r) for r in rows]
                indexed = [(a, b, c) for a, b, c in indexed if b is not None]
                if len(indexed) >= 2:
                    indexed.sort(key=lambda x: x[0])
                    first_v = indexed[0][1]
                    last_v = indexed[-1][1]
                    if first_v and abs(first_v) > 1e-9:
                        chg = (last_v - first_v) / abs(first_v) * 100
                        direction = "рост" if chg > 1 else ("снижение" if chg < -1 else "стабилизация")
                        return (
                            f"По оси «{tcol}» метрика «{m}»: {direction} примерно на {abs(chg):.1f}% "
                            f"между первой и последней точкой ряда ({len(indexed)} наблюдений)."
                        )
            if m:
                seq = [_to_float(r.get(m)) for r in rows]
                seq = [v for v in seq if v is not None]
                if len(seq) >= 2:
                    chg = seq[-1] - seq[0]
                    return f"Метрика «{m}» меняется по ряду: от {seq[0]} до {seq[-1]} (Δ {chg:+.4g}) на {len(seq)} точках."

        # --- Рейтинг: первая строка как топ (раньше гео/отмен, чтобы не перебивать явный intent) ---
        if intent == "ranking" and metric:
            top = rows[0]
            lab = _row_label(top, dim, columns)
            mv = _to_float(top.get(metric))
            if mv is not None:
                return f"На первой позиции выборки: «{lab}», метрика «{metric}» = {mv:.4g}."

        # --- Гео / выброс по городам ---
        if intent == "geo" or (dim and _CITY_DIM.search(dim) and metric):
            vals = [(i, _to_float(r.get(metric))) for i, r in enumerate(rows)]
            vals = [(i, v) for i, v in vals if v is not None]
            if len(vals) >= 2:
                mean = sum(v for _, v in vals) / len(vals)
                if mean > 0:
                    mx_i, mx_v = max(vals, key=lambda x: x[1])
                    ratio = mx_v / mean
                    if ratio >= 1.4:
                        city = _row_label(rows[mx_i], dim, columns)
                        return (
                            f"Пик по «{metric}» у «{city}»: значение {mx_v:.4g} (~{ratio:.2f}× от среднего по строкам); "
                            "остальные города ниже — проверьте концентрацию эффекта."
                        )

        # --- Отмены / риск ---
        cancel_m = next((c for c in columns if _CANCEL_METRIC.search(c)), None)
        if cancel_m:
            vals = [_to_float(r.get(cancel_m)) for r in rows]
            vals = [v for v in vals if v is not None]
            if vals:
                mx = max(vals)
                mean = sum(vals) / len(vals)
                if mean > 0 and mx / mean >= 1.35:
                    hi = next(i for i, r in enumerate(rows) if _to_float(r.get(cancel_m)) == mx)
                    where = _row_label(rows[hi], dim, columns)
                    return (
                        f"Повышенный показатель «{cancel_m}» у «{where}» ({mx:.4g} против среднего {mean:.4g}) — "
                        "имеет смысл разобрать причины отмен в этом срезе."
                    )

        # --- Сравнение категорий: лучший / худший сегмент ---
        if intent == "comparison" or (metric and dim):
            m = metric or _pick_metric_column(columns, rows)
            d = dim if dim else _pick_dimension_column(columns, m, rows)
            if m and d:
                scored = [( _to_float(r.get(m)), _row_label(r, d, columns), r) for r in rows]
                scored = [(v, lab, r) for v, lab, r in scored if v is not None]
                if len(scored) >= 2:
                    scored.sort(key=lambda x: -x[0])
                    best_v, best_l, _ = scored[0]
                    worst_v, worst_l, _ = scored[-1]
                    return (
                        f"Лучший сегмент по «{m}»: {best_l} ({best_v:.4g}); "
                        f"худший: {worst_l} ({worst_v:.4g}) среди {len(scored)} строк."
                    )

        # --- Две точки / периоды в одной колонке времени ---
        if len(rows) == 2 and tcol:
            m = metric or _pick_metric_column(columns, rows)
            if m:
                v1, v2 = _to_float(rows[0].get(m)), _to_float(rows[1].get(m))
                if v1 is not None and v2 is not None:
                    return (
                        f"Сравнение двух периодов/точек по «{tcol}»: метрика «{m}» "
                        f"{v1:.4g} → {v2:.4g} (изменение {v2 - v1:+.4g})."
                    )

        # --- Запасной числовой диапазон по первой числовой колонке ---
        m2 = metric or _pick_metric_column(columns, rows)
        if m2:
            vals = [_to_float(r.get(m2)) for r in rows]
            vals = [v for v in vals if v is not None]
            if len(vals) >= 2:
                return f"По метрике «{m2}» диапазон от {min(vals):.4g} до {max(vals):.4g} ({len(vals)} значений)."

        return f"Получено {len(rows)} строк; колонки: {', '.join(columns)} — откройте таблицу для деталей."
