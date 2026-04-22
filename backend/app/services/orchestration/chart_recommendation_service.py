"""Rules-first chart type recommendation from intent + result schema + sample rows."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, List, Optional, Set

from app.schemas.orchestration import IntentKind
from app.schemas.visualization import GeoVisualizationMetadata, VisualizationRecommendation

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
    """MVP rules engine. Deterministic, explainable, and demo-friendly."""

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
            return self._result("table", ["bar"], "Нет колонок в результате — показываем таблицу.", 0.72)

        prof = self._profile_columns(columns, rows)
        n_rows = len(rows)
        n_cat = len(prof.categorical)
        n_num = len(prof.numeric)
        has_geo_signal = self._has_geo_signal(qlow, prof)
        geo_meta = self._geo_metadata(prof, qlow) if has_geo_signal else None

        # GEO first: map/geo_bubble/heatmap + graceful fallbacks.
        if has_geo_signal:
            if prof.coords and len(prof.coords) >= 2 and n_num >= 1:
                return self._result(
                    "geo_bubble",
                    ["map", "horizontal_bar", "heatmap", "table"],
                    "Есть гео-координаты и метрика — выбираем geo bubble.",
                    0.9,
                    geo_meta,
                )
            if n_cat >= 1 and n_num >= 1:
                return self._result(
                    "map",
                    ["heatmap", "horizontal_bar", "geo_bubble", "table"],
                    "Запрос географический: пытаемся отрисовать карту, при необходимости переключаемся на fallback.",
                    0.86,
                    geo_meta,
                )
            return self._result(
                "horizontal_bar",
                ["heatmap", "table"],
                "Гео-сигнал есть, но данных для карты недостаточно — используем аналитический fallback.",
                0.8,
                geo_meta,
            )

        # Multiple metrics with categories: stacked / grouped.
        if n_cat >= 1 and n_num >= 2:
            if prof.time:
                return self._result(
                    "combo",
                    ["line", "stacked_bar", "area", "table"],
                    "Временной ряд с несколькими метриками — комбинированный график fact vs plan.",
                    0.92,
                )
            if "профил" in qlow or "profile" in qlow:
                return self._result(
                    "radar",
                    ["stacked_bar", "bar", "table"],
                    "Профиль по нескольким метрикам — radar chart.",
                    0.85,
                )
            return self._result(
                "stacked_bar",
                ["bar", "horizontal_bar", "table"],
                "Несколько метрик по категориям — стек для сравнения структуры.",
                0.88,
            )

        # Trend / time dynamics.
        if intent in ("trend", "forecast") or prof.time or any(x in qlow for x in ("динамик", "тренд", "по дням", "по недел", "по месяц")):
            if n_num >= 2:
                return self._result(
                    "combo",
                    ["line", "area", "bar", "table"],
                    "Динамика во времени и несколько метрик — комбинированный график.",
                    0.9,
                )
            return self._result(
                "line",
                ["area", "bar", "table"],
                "Для динамики по времени выбран линейный график.",
                0.93 if prof.time else 0.86,
            )

        # Share / composition.
        if intent == "share" or prof.has_share_column or any(x in qlow for x in ("дол", "структур", "процент")):
            return self._result(
                "donut",
                ["pie", "bar", "table"],
                "Для структуры и долей выбран donut chart.",
                0.9,
            )

        # Ranking / top.
        if intent == "ranking" or any(x in qlow for x in ("топ", "рейтинг", "лидер")):
            return self._result(
                "horizontal_bar",
                ["bar", "table"],
                "Для рейтингов и top-N лучше подходит горизонтальная столбчатая диаграмма.",
                0.9,
            )

        # Scatter relationship.
        if n_num >= 2 and not prof.time:
            return self._result(
                "scatter",
                ["bar", "table"],
                "Связь двух числовых метрик лучше читается на scatter.",
                0.84,
            )

        # Distribution.
        if n_num == 1 and n_rows >= 12 and intent != "summary":
            return self._result(
                "heatmap",
                ["histogram", "bar", "table"],
                "Для плотного набора наблюдений выбираем heatmap-like распределение.",
                0.8,
            )

        # Comparison baseline.
        if intent == "comparison" or (n_cat >= 1 and n_num >= 1):
            return self._result(
                "bar",
                ["horizontal_bar", "table"],
                "Для сравнения категорий выбрана столбчатая диаграмма.",
                0.88,
            )

        if intent == "summary" or n_rows <= 1:
            return self._result(
                "table",
                ["bar", "line"],
                "Сводка с небольшим объемом данных — табличный fallback.",
                0.8,
            )

        return self._result(
            "table",
            ["bar", "line"],
            "Универсальный fallback: таблица с возможностью переключения.",
            0.74,
        )

    def _profile_columns(self, columns: List[str], rows: List[dict[str, Any]]) -> ColumnProfile:
        time_cols: List[str] = []
        geo_names: List[str] = []
        coords: List[str] = []
        numeric: List[str] = []
        categorical: List[str] = []
        has_share = False

        for c in columns:
            lc = c.lower()
            if lc == "share" or "percent" in lc or "ratio" in lc:
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
    def _has_geo_signal(query_lc: str, prof: ColumnProfile) -> bool:
        query_geo = any(
            token in query_lc
            for token in (
                "по город",
                "по регион",
                "по субъект",
                "географ",
                "росси",
                "geo",
                "city",
                "region",
            )
        )
        return bool(query_geo or prof.geo_names or prof.coords)

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
        return VisualizationRecommendation(
            recommended_chart_type=primary,
            alternative_chart_types=ordered_alts,
            visualization_explanation=explanation,
            recommendation_reason=explanation,
            visualization_confidence=round(min(1.0, max(0.0, confidence)), 2),
            geo_metadata=geo_metadata,
        )
