from __future__ import annotations

import uuid

from app.core.config import Settings
from app.services.guardrails.policy_engine import (
    check_prompt_abuse,
    check_rate_limit,
    evaluate_canonical_metric_for_role,
    evaluate_entities_for_role,
)


def test_executive_blocked_on_revenue_metric() -> None:
    errs = evaluate_canonical_metric_for_role(role_key="executive", canonical_metric_key="sum_order_price")
    assert errs
    assert "sum_order_price" in errs[0].lower()


def test_manager_unrestricted_metric_list() -> None:
    assert evaluate_canonical_metric_for_role(role_key="manager", canonical_metric_key="sum_order_price") == []


def test_prompt_abuse_respects_newline_setting() -> None:
    s = Settings(guardrails_max_prompt_newlines=2)
    assert check_prompt_abuse("a\nb\nc\nd", s)


def test_rate_limit_can_be_disabled() -> None:
    s = Settings(guardrails_rate_limit_enabled=False)
    assert check_rate_limit(settings=s, user_id="u1", role_key=None) == []


def test_prompt_abuse_max_chars() -> None:
    s = Settings(guardrails_max_prompt_chars=12)
    assert check_prompt_abuse("x" * 13, s)
    assert check_prompt_abuse("x" * 12, s) == []


def test_prompt_abuse_rejects_empty_and_whitespace() -> None:
    s = Settings()
    assert check_prompt_abuse("", s)
    assert check_prompt_abuse("   \n\t  ", s)


def test_prompt_abuse_rejects_zero_width_only() -> None:
    s = Settings()
    assert check_prompt_abuse("\u200b\u200c\u200d", s)


def test_prompt_abuse_rejects_disallowed_control_chars() -> None:
    s = Settings()
    assert check_prompt_abuse("привет\x07мир", s)


def test_prompt_abuse_allows_normal_newlines() -> None:
    s = Settings(guardrails_max_prompt_newlines=10)
    assert check_prompt_abuse("строка1\nстрока2\nстрока3", s) == []


def test_prompt_abuse_suspicious_multiline_short_lines() -> None:
    s = Settings(guardrails_max_prompt_newlines=30)
    prompt = "\n".join(["x", "y", "z", "1", "2", "3", "ok", "go"])
    errs = check_prompt_abuse(prompt, s)
    assert any("multi-line" in e for e in errs)


def test_executive_blocked_on_sensitive_entities() -> None:
    errs = evaluate_entities_for_role(
        role_key="executive",
        entities={"user_id": "42", "filter_candidates": ["driver_id = 7"]},
    )
    assert errs
    assert "executive" in errs[0]


def test_manager_not_blocked_on_sensitive_entities_here() -> None:
    assert evaluate_entities_for_role(role_key="manager", entities={"user_id": "42"}) == []


def test_rate_limit_blocks_after_max_requests() -> None:
    import app.services.guardrails.policy_engine as pe

    pe._RATE_BUCKETS.clear()
    uid = f"rate-{uuid.uuid4()}"
    s = Settings(
        guardrails_rate_limit_enabled=True,
        guardrails_rate_limit_window_seconds=120,
        guardrails_max_requests_per_window=2,
    )
    assert check_rate_limit(settings=s, user_id=uid, role_key=None) == []
    assert check_rate_limit(settings=s, user_id=uid, role_key=None) == []
    err = check_rate_limit(settings=s, user_id=uid, role_key=None)
    assert err and "лимит" in err[0].lower()
    pe._RATE_BUCKETS.pop(uid, None)


def test_rate_limit_window_expires_with_mock_time(monkeypatch) -> None:
    import app.services.guardrails.policy_engine as pe

    pe._RATE_BUCKETS.clear()
    uid = f"rate-expire-{uuid.uuid4()}"
    s = Settings(
        guardrails_rate_limit_enabled=True,
        guardrails_rate_limit_window_seconds=10,
        guardrails_max_requests_per_window=2,
    )
    now = {"value": 100.0}

    def fake_monotonic() -> float:
        return float(now["value"])

    monkeypatch.setattr(pe.time, "monotonic", fake_monotonic)
    assert check_rate_limit(settings=s, user_id=uid, role_key=None) == []
    now["value"] = 105.0
    assert check_rate_limit(settings=s, user_id=uid, role_key=None) == []
    now["value"] = 106.0
    blocked = check_rate_limit(settings=s, user_id=uid, role_key=None)
    assert blocked and "лимит" in blocked[0].lower()

    # Окно истекло: earliest timestamp должен выпасть из deque.
    now["value"] = 111.5
    assert check_rate_limit(settings=s, user_id=uid, role_key=None) == []
    pe._RATE_BUCKETS.pop(uid, None)
