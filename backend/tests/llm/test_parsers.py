from __future__ import annotations

import unittest

from app.schemas.llm import LLMQueryInterpretation
from app.services.llm.parsers import extract_json_object, parse_to_model


class ParserTests(unittest.TestCase):
    def test_extract_json_from_fenced_block(self) -> None:
        raw = '```json\n{"intent":"comparison","metrics":["client_cancellations"],"dimensions":["city_id"],"filters":[],"time_period":null,"ambiguities":[],"confidence":0.9}\n```'
        payload = extract_json_object(raw)
        self.assertEqual(payload["intent"], "comparison")

    def test_parse_to_model(self) -> None:
        raw = '{"intent":"summary","metrics":[],"dimensions":[],"filters":[],"time_period":null,"ambiguities":[],"confidence":0.6}'
        model = parse_to_model(raw, LLMQueryInterpretation)
        self.assertEqual(model.intent, "summary")
        self.assertAlmostEqual(model.confidence, 0.6)

    def test_parse_to_model_normalizes_top_n_intent(self) -> None:
        raw = '{"intent":"top_n","metrics":[],"dimensions":["city_id"],"filters":[],"time_period":null,"ambiguities":[],"confidence":0.7}'
        model = parse_to_model(raw, LLMQueryInterpretation)
        self.assertEqual(model.intent, "ranking")


if __name__ == "__main__":
    unittest.main()
