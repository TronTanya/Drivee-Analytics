from __future__ import annotations

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
