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


if __name__ == "__main__":
    unittest.main()
