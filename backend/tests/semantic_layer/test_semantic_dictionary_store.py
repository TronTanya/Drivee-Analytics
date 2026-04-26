from __future__ import annotations

import unittest

from app.services.semantic_layer.store import SemanticDictionaryStore, _default_dictionary_path


class SemanticDictionaryStoreTests(unittest.TestCase):
    def test_loads_json(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        self.assertGreater(len(store.terms), 3)

    def test_resolve_hint_orders(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        res = store.resolve_with_hint("динамика по городам", "sum_order_price")
        self.assertEqual(res[0].term_key, "sum_order_price")
        self.assertIn("SUM", res[0].sql_fragment)

    def test_cancellation_query_prefers_total_bucket(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        q = "Покажи топ-1 города по количеству отменённых заказов на этот месяц"
        res = store.resolve_query(q)
        self.assertGreater(len(res), 0)
        self.assertEqual(res[0].term_key, "cancellations_total")

    def test_resolves_dimension_and_filter_terms(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        store.bootstrap_from_train()
        dims = store.resolve_dimensions("Сравни заказы по каналам за март")
        flt = store.resolve_filters("Покажи выручку по городам за прошлую неделю")
        self.assertIn("order_channel", dims)
        self.assertEqual(flt.get("time_period"), "previous_week")

    def test_dictionary_has_version_metadata(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        meta = store.metadata()
        self.assertTrue(meta.get("version"))
        self.assertEqual(meta.get("term_count"), len(store.terms))

    def test_complex_jury_phrases_resolve_target_metrics(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())

        q1 = (
            "Сколько уникальных отмен пассажира после старта поездки "
            "по месяцам и городам в 2026 году?"
        )
        res1 = store.resolve_query(q1)
        self.assertGreater(len(res1), 0)
        self.assertEqual(res1[0].term_key, "unique_client_cancels_after_start")

        q2 = (
            "Какая двухэтапная конверсия пассажиров по всей сети за июнь 2025: "
            "первый этап принятие заказа, второй этап завершение поездки?"
        )
        res2 = store.resolve_query(q2)
        keys = [r.term_key for r in res2]
        self.assertIn("acceptance_conversion", keys)
        self.assertIn("completion_conversion", keys)

    def test_typo_heavy_jury_phrases_resolve_target_metrics(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())

        q1 = (
            "Скока уникалные отмененые поездки пасажира после начяла поездки "
            "по месяцам и горадам в 2026 году?"
        )
        res1 = store.resolve_query(q1)
        self.assertGreater(len(res1), 0)
        self.assertEqual(res1[0].term_key, "unique_client_cancels_after_start")

        q2 = (
            "Какая конверисия в 2 этапа у пасажиров по всей сити за июн 2025: "
            "принетые заказы и завершеные поездки?"
        )
        res2 = store.resolve_query(q2)
        keys = [r.term_key for r in res2]
        self.assertIn("acceptance_conversion", keys)
        self.assertIn("completion_conversion", keys)

    def test_wrong_keyboard_layout_query_resolves_metrics(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        # "принятые заказы и завершенные поездки по всей сети июнь 2025"
        q = "ghbyznst pfrfps b pfdthityyst gjtplrb gj dctq ctnb b.,y 2025"
        res = store.resolve_query(q)
        keys = [r.term_key for r in res]
        self.assertIn("acceptance_conversion", keys)
        self.assertIn("completion_conversion", keys)

    def test_fuzzy_fallback_for_noisy_phrase(self) -> None:
        store = SemanticDictionaryStore.load(_default_dictionary_path())
        q = "конверcия принетых заказоф и заверщеных поезок по всей сети ийнь 2025"
        res = store.resolve_query(q)
        self.assertGreater(len(res), 0)
        keys = {r.term_key for r in res}
        self.assertTrue(
            any(r.surface_form.startswith("fuzzy:") for r in res)
            or {"acceptance_conversion", "completion_conversion"}.issubset(keys)
        )


if __name__ == "__main__":
    unittest.main()
