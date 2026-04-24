"""Rules-first chart type recommendation from intent + result schema + sample rows."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, List, Optional, Set

from app.schemas.orchestration import IntentKind
from app.schemas.visualization import GeoMapFeature, GeoVisualizationMetadata, VisualizationRecommendation

_TIME_NAME_RE = re.compile(
    r"(^|_)(bucket|week|month|day|date|time|ts|at)$|_date$|_at$|^date_|^datetime",
    re.IGNORECASE,
)
_GEO_NAME_TOKENS = frozenset(
    {
        "city",
        "city_id",
        "region",
        "country",
        "state",
        "province",
        "geo",
        "oblast",
        "district",
        "federal_district",
        "subject",
    }
)
_COORD_NAMES = frozenset({"lat", "latitude", "lon", "lng", "longitude", "x_coord", "y_coord"})


@dataclass
class ColumnProfile:
    time: List[str]
    geo_names: List[str]
    coords: List[str]
    numeric: List[str]
    categorical: List[str]
    has_share_column: bool


class ChartRecommendationService:
    """Детерминированный выбор графика: смысл вопроса (intent + текст) + форма результата (колонки/строки).

    Правила (порядок веток в `recommend`):
    гео → карта/geo_bubble пригодны; иначе таблица как честный fallback;
    доли/структура → donut (+ pie в альтернативах);
    рейтинг/top-N → horizontal_bar;
    динамика/время → line;
    две метрики без оси времени → scatter;
    сравнение категорий → bar;
    иначе — table (переключение типа вручную в UI).
    """

    def recommend(
        self,
        intent: IntentKind,
        columns: List[str],
        rows: List[dict[str, Any]],
        *,
        effective_query: str = "",
    ) -> VisualizationRecommendation:
        qlow = (effective_query or "").lower()
        if not columns:
            return self._result("table", ["bar", "line", "horizontal_bar"], "Нет колонок в результате — только таблица.", 0.72)

        prof = self._profile_columns(columns, rows)
        n_num = len(prof.numeric)
        n_cat = len(prof.categorical)
        has_geo = self._has_geo_signal(qlow, prof, intent)

        # 1) География: только явный запрос / intent geo / координаты (не просто city_id в таблице).
        if has_geo:
            geo_base = self._geo_metadata(prof, qlow)
            map_features = self._build_map_features(rows, prof)
            geo_meta = geo_base.model_copy(update={"map_features": map_features})

            if prof.coords and len(prof.coords) >= 2 and n_num >= 1:
                return self._result(
                    "geo_bubble",
                    ["map", "horizontal_bar", "bar", "table"],
                    "Есть координаты и метрика — рекомендуем geo bubble; карта и таблица доступны как альтернативы.",
                    0.9,
                    geo_meta,
                )
            if n_num >= 1 and (prof.geo_names or prof.categorical):
                return self._result(
                    "map",
                    ["geo_bubble", "horizontal_bar", "bar", "table"],
                    "Географический запрос: структура данных пригодна для карты (MVP: geo card + map_features).",
                    0.86,
                    geo_meta,
                )
            return self._result(
                "table",
                ["horizontal_bar", "bar", "map"],
                "Гео-контекст, но данных недостаточно для карты — таблица; график можно выбрать вручную.",
                0.72,
                geo_meta,
            )

        # 2) Доля / композиция.
        if intent == "share" or prof.has_share_column or any(x in qlow for x in ("дол", "структур", "процент", "долю")):
            return self._result(
                "donut",
                ["pie", "bar", "horizontal_bar", "table"],
                "Доля и структура — donut (кольцо); pie и столбцы можно выбрать вручную.",
                0.9,
            )

        # 3) Рейтинг / top-N.
        if intent == "ranking" or any(x in qlow for x in ("топ", "рейтинг", "лидер")) or (
            qlow.startswith("top ") or " top " in f" {qlow} "
        ):
            return self._result(
                "horizontal_bar",
                ["bar", "line", "table"],
                "Рейтинг и top-N — горизонтальные столбцы для сравнения категорий по одной метрике.",
                0.9,
            )

        # 4) Динамика во времени.
        dynamics_q = any(
            x in qlow
            for x in (
                "динамик",
                "тренд",
                "по дням",
                "по недел",
                "по месяц",
                "во времени",
                "time series",
            )
        )
        # Временная ось сама по себе не включает «динамику», если intent=summary (избегаем ложного line на сырых заказах).
        time_axes_for_line = bool(prof.time) and intent not in ("summary",)
        if intent in ("trend", "forecast") or dynamics_q or time_axes_for_line:
            return self._result(
                "line",
                ["area", "bar", "horizontal_bar", "table"],
                "Динамика и временной ряд — линейный график (несколько метрик — несколько серий).",
                0.92 if prof.time else 0.86,
            )

        # 5) Две числовые метрики без временной оси — scatter.
        scatter_q = any(x in qlow for x in ("scatter", "корреляц", "зависимост", " vs ", " против ", "точеч"))
        if n_num >= 2 and not prof.time and (n_cat == 0 or scatter_q):
            return self._result(
                "scatter",
                ["line", "bar", "table"],
                "Две числовые метрики без временной оси — scatter для связи значений.",
                0.84,
            )

        # 6) Сравнение категорий.
        if intent == "comparison" or (n_cat >= 1 and n_num >= 1):
            return self._result(
                "bar",
                ["horizontal_bar", "line", "donut", "table"],
                "Сравнение категорий — вертикальные столбцы.",
                0.88,
            )

        # 7) Универсальный fallback — только таблица как основной график-слот (данные всё равно в table cell).
        return self._result(
            "table",
            ["bar", "line", "horizontal_bar", "donut"],
            "Недостаточно сигналов для специализированного графика — таблица как безопасный default; переключение вручную.",
            0.74,
        )

    def _build_map_features(self, rows: List[dict[str, Any]], prof: ColumnProfile) -> List[GeoMapFeature]:
        if not rows:
            return []
        label_col: Optional[str] = None
        if prof.geo_names:
            label_col = prof.geo_names[0]
        elif prof.categorical:
            label_col = prof.categorical[0]
        if not label_col:
            return []
        value_col: Optional[str] = None
        for c in prof.numeric:
            if c != label_col:
                value_col = c
                break
        lat_c = prof.coords[0] if len(prof.coords) > 0 else None
        lon_c = prof.coords[1] if len(prof.coords) > 1 else None
        out: List[GeoMapFeature] = []
        for row in rows[:200]:
            label = str(row.get(label_col, "") or "—")
            rid = label
            val: Optional[float] = None
            if value_col is not None:
                val = self._as_float(row.get(value_col))
            lat = self._as_float(row.get(lat_c)) if lat_c else None
            lon = self._as_float(row.get(lon_c)) if lon_c else None
            out.append(GeoMapFeature(id=rid, label=label, value=val, lat=lat, lon=lon))
        return out

    @staticmethod
    def _as_float(v: Any) -> Optional[float]:
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

    def _profile_columns(self, columns: List[str], rows: List[dict[str, Any]]) -> ColumnProfile:
        time_cols: List[str] = []
        geo_names: List[str] = []
        coords: List[str] = []
        numeric: List[str] = []
        categorical: List[str] = []
        has_share = False

        for c in columns:
            lc = c.lower()
            if lc == "share" or "percent" in lc or "ratio" in lc or "conversion" in lc:
                has_share = True
            if _TIME_NAME_RE.search(lc) or lc in ("week", "month", "bucket"):
                time_cols.append(c)
            elif lc in _COORD_NAMES or lc.endswith("_lat") or lc.endswith("_lon"):
                coords.append(c)
            elif lc in _GEO_NAME_TOKENS:
                geo_names.append(c)
            elif self._column_is_numeric(c, rows):
                numeric.append(c)
            else:
                categorical.append(c)

        return ColumnProfile(
            time=time_cols,
            geo_names=geo_names,
            coords=coords,
            numeric=numeric,
            categorical=categorical,
            has_share_column=has_share,
        )

    @staticmethod
    def _column_is_numeric(col: str, rows: List[dict[str, Any]]) -> bool:
        if not rows:
            return False
        found = 0
        ok = 0
        for r in rows[:50]:
            if col not in r:
                continue
            found += 1
            v = r[col]
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            if isinstance(v, (int, float)):
                ok += 1
            elif isinstance(v, str) and v.strip():
                try:
                    float(v.replace(",", "."))
                    ok += 1
                except ValueError:
                    pass
        if found == 0:
            return False
        return ok / found >= 0.7

    @staticmethod
    def _has_geo_signal(query_lc: str, prof: ColumnProfile, intent: IntentKind) -> bool:
        if intent == "geo":
            return True
        query_geo = any(
            token in query_lc
            for token in (
                "по город",
                "города",
                "на карте",
                "карт",
                "карта",
                "географ",
                "по регион",
                "регион",
                "област",
                "субъект",
                "росси",
                "geo",
                "map",
                "region",
                "latitude",
                "longitude",
            )
        )
        if query_geo:
            return True
        return bool(prof.coords)

    @staticmethod
    def _geo_metadata(prof: ColumnProfile, query_lc: str) -> GeoVisualizationMetadata:
        geo_dim = prof.geo_names[0] if prof.geo_names else (prof.coords[0] if prof.coords else None)
        map_scope = "russia" if "росси" in query_lc else "auto"
        fallback = "horizontal_bar" if geo_dim == "city_id" else "heatmap"
        return GeoVisualizationMetadata(
            geo_enabled=True,
            geo_dimension=geo_dim,
            map_scope=map_scope,
            fallback_chart_type=fallback,
            map_features=[],
        )

    @staticmethod
    def _result(
        primary: str,
        alts: List[str],
        explanation: str,
        confidence: float,
        geo_metadata: Optional[GeoVisualizationMetadata] = None,
    ) -> VisualizationRecommendation:
        seen: Set[str] = {primary}
        ordered_alts: List[str] = []
        for a in alts:
            if a not in seen:
                seen.add(a)
                ordered_alts.append(a)
        if primary != "table" and "table" not in seen:
            ordered_alts.append("table")
            seen.add("table")
        return VisualizationRecommendation(
            recommended_chart_type=primary,
            alternative_chart_types=ordered_alts,
            visualization_explanation=explanation,
            recommendation_reason=explanation,
            visualization_confidence=round(min(1.0, max(0.0, confidence)), 2),
            geo_metadata=geo_metadata,
        )
