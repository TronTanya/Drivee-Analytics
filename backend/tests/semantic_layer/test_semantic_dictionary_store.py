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


if __name__ == "__main__":
    unittest.main()
