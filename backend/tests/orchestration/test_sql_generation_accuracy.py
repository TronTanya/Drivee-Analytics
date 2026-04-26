"""Проверки точности генерируемого SQL (NL → intent → entities → SQL).

Маркер `sql_accuracy`: тесты, которые сверяют результат с полным train в Postgres.

Регрессии: summary без времени не должен подмешивать rolling-window;
явный календарный год и окно завершения (driverdone) для завершённых за YYYY.
Опционально: сравнение с эталонным запросом в Postgres при большом train.
"""

from __future__ import annotations

import unittest

import pytest
from sqlalchemy import text

from app.db.session import engine
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.sql_generation_service import SQLGenerationService
from app.services.orchestration.semantic_service import SemanticService


def _nl_pipeline_sql(query: str) -> tuple[str, dict]:
    """Повторяет порядок сущностей как в QueryOrchestrator (без notebook_context)."""
    isvc = IntentService(llm_service=None)
    intent_res = isvc.classify_intent(query)
    entities = isvc.extract_entities(query)
    if intent_res.entities:
        entities.update(intent_res.entities)
    parser = SemanticParser()
    interp, patch = parser.build(
        effective_query=query,
        intent=intent_res.intent,
        intent_signals=intent_res.signals,
        entities=dict(entities),
    )
    merged = dict(entities)
    for k, v in patch.items():
        if v is not None and v != "":
            merged[k] = v
    sem = SemanticService()
    resolutions = sem.resolve_with_hint(query, str(merged.get("metric_hint") or ""))
    metric_sql = sem.primary_metric_sql(resolutions)
    sql = SQLGenerationService().generate(
        intent=intent_res.intent,
        entities=merged,
        metric_sql=metric_sql,
        use_campaigns_only=False,
        workspace_id=None,
    )
    return sql, merged


class SqlGenerationAccuracyTests(unittest.TestCase):
    def test_done_rides_2026_summary_uses_driverdone_bounds(self) -> None:
        q = "Количество уникальных завершенных поездок за 2026 год"
        sql, merged = _nl_pipeline_sql(q)
        self.assertEqual(merged.get("calendar_year"), 2026)
        self.assertEqual(merged.get("time_window_anchor"), "driverdone_timestamp")
        self.assertIn("Europe/Moscow", sql)
        self.assertIn("DATE '2026-01-01'", sql)
        self.assertIn("DATE '2026-12-31'", sql)
        self.assertIn("a.driverdone_timestamp", sql)
        self.assertIn("AS value", sql)

    def test_orders_count_2024_summary_uses_order_timestamp_bounds(self) -> None:
        q = "сколько заказов за 2024 год"
        sql, merged = _nl_pipeline_sql(q)
        self.assertEqual(merged.get("calendar_year"), 2024)
        self.assertEqual(merged.get("time_window_anchor"), "order_timestamp")
        self.assertIn("make_timestamptz(2024, 1, 1, 0, 0, 0, 'UTC')", sql)
        self.assertIn("a.order_timestamp::timestamptz", sql)
        self.assertNotIn("a.driverdone_timestamp::timestamptz >=", sql)

    def test_summary_without_calendar_has_no_timestamptz_year_window(self) -> None:
        q = "сколько всего завершенных поездок"
        sql, merged = _nl_pipeline_sql(q)
        self.assertNotIn("make_timestamptz", sql)
        self.assertIsNone(merged.get("calendar_year"))
        self.assertIn("WHERE 1=1", sql)

    def test_ranking_with_calendar_year_includes_bounds(self) -> None:
        q = "топ 3 города по отменам за 2023 год"
        isvc = IntentService(llm_service=None)
        self.assertEqual(isvc.classify_intent(q).intent, "ranking")
        sql, merged = _nl_pipeline_sql(q)
        self.assertEqual(merged.get("calendar_year"), 2023)
        self.assertIn("make_timestamptz(2023", sql)
        self.assertIn("GROUP BY", sql)
        self.assertIn("LIMIT 3", sql)

    @pytest.mark.sql_accuracy
    def test_e2e_generated_sql_matches_canonical_when_train_is_large(self) -> None:
        """При полном демо-train сравниваем результат выполнения с эталоном в БД."""
        try:
            with engine.connect() as conn:
                n = conn.execute(text("SELECT COUNT(*)::bigint FROM public.incity_orders")).scalar_one()
        except Exception:
            self.skipTest("postgres недоступен")
        if int(n or 0) < 100_000:
            self.skipTest("слишком мало строк в train для эталонной проверки")

        q = "Количество уникальных завершенных поездок за 2026 год"
        sql, _merged = _nl_pipeline_sql(q)
        canonical = """
            SELECT COUNT(DISTINCT order_id)::bigint AS value
            FROM public.incity_orders a
            WHERE a.driverdone_timestamp IS NOT NULL
              AND (a.driverdone_timestamp AT TIME ZONE 'Europe/Moscow')::date >= DATE '2026-01-01'
              AND (a.driverdone_timestamp AT TIME ZONE 'Europe/Moscow')::date <= DATE '2026-12-31'
        """
        with engine.connect() as conn:
            gen_val = conn.execute(text(sql)).scalar_one()
            ref_val = conn.execute(text(canonical)).scalar_one()
        self.assertEqual(int(gen_val), int(ref_val), msg=f"SQL={sql!r}")


if __name__ == "__main__":
    unittest.main()
