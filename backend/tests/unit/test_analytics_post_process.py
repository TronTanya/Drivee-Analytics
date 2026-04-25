from __future__ import annotations

from app.services.analytics_post_process import post_process_sql_result


def test_empty_rows_returns_insufficient_forecast_note() -> None:
    out = post_process_sql_result([], ["a"])
    assert out["insights"] == []
    assert out["anomalies"] == []
    assert out["forecast"]["sufficient_data"] is False
    assert "Недостаточно" in str(out["forecast"].get("note_ru", ""))


def test_forecast_when_enough_numeric_points() -> None:
    rows = [{"i": i, "revenue": float(i * 10)} for i in range(8)]
    out = post_process_sql_result(rows, ["i", "revenue"])
    assert out["forecast"]["sufficient_data"] is True
    assert isinstance(out["forecast"].get("delta_pct"), (int, float))
    assert out["forecast"].get("summary")


def test_insight_half_period_comparison() -> None:
    first = [{"day": d, "m": 100.0} for d in range(8)]
    second = [{"day": d + 8, "m": 130.0} for d in range(8)]
    out = post_process_sql_result(first + second, ["day", "m"])
    assert out["insights"]
    assert any("вырос" in s.lower() or "сниз" in s.lower() for s in out["insights"])


def test_anomaly_high_segment_z_score() -> None:
    rows = []
    for _ in range(6):
        rows.append({"city_id": 1, "rev": 1.0})
        rows.append({"city_id": 2, "rev": 1.0})
        rows.append({"city_id": 3, "rev": 1.0})
    for _ in range(6):
        rows.append({"city_id": 99, "rev": 50_000.0})
    out = post_process_sql_result(rows, ["city_id", "rev"])
    segs = {str(a.get("segment")) for a in out["anomalies"]}
    assert "99" in segs
