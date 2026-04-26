from __future__ import annotations

import unittest

from app.services.sql_column_labels_ru import build_sql_column_labels_map, sql_column_label_ru


class SqlColumnLabelsRuTests(unittest.TestCase):
    def test_funnel_columns(self) -> None:
        self.assertEqual(sql_column_label_ru("acceptance_conversion"), "Конверсия в принятие, %")
        self.assertEqual(sql_column_label_ru("CREATED_ORDERS"), "Созданные заказы")

    def test_build_map_preserves_keys(self) -> None:
        cols = ["created_orders", "dim", "unknown_xyz"]
        m = build_sql_column_labels_map(cols)
        self.assertEqual(m["created_orders"], "Созданные заказы")
        self.assertEqual(m["dim"], "Город")
        self.assertEqual(m["unknown_xyz"], "unknown xyz")


if __name__ == "__main__":
    unittest.main()
