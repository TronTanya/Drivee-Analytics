from __future__ import annotations

import uuid

from app.core.config import Settings
from app.services.guardrails.policy_engine import (
    check_prompt_abuse,
    check_rate_limit,
    evaluate_canonical_metric_for_role,
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
