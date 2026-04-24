"""Формальная матрица возможностей по ролям (backend enforcement).

Используется FastAPI-зависимостями и может дублироваться в explainability trace.
UI скрывает кнопки, но источник истины — эти проверки.
"""

from __future__ import annotations

from typing import AbstractSet, Final, Mapping, Optional

from app.core.exceptions import ForbiddenException

RUN_QUERY: Final = "run_query"
VIEW_SQL: Final = "view_sql"
SAVE_REPORT: Final = "save_report"
SCHEDULE_REPORT: Final = "schedule_report"
EDIT_DICTIONARY: Final = "edit_dictionary"
VIEW_QUALITY_CENTER: Final = "view_quality_center"
ADMIN_SETTINGS: Final = "admin_settings"

ALL_ACTIONS: AbstractSet[str] = frozenset(
    {
        RUN_QUERY,
        VIEW_SQL,
        SAVE_REPORT,
        SCHEDULE_REPORT,
        EDIT_DICTIONARY,
        VIEW_QUALITY_CENTER,
        ADMIN_SETTINGS,
    }
)

ROLE_CAPABILITIES: Mapping[str, frozenset[str]] = {
    "admin": frozenset(ALL_ACTIONS),
    "manager": frozenset(ALL_ACTIONS - {ADMIN_SETTINGS}),
    "marketer": frozenset(
        {
            RUN_QUERY,
            VIEW_SQL,
            SAVE_REPORT,
            SCHEDULE_REPORT,
            VIEW_QUALITY_CENTER,
        }
    ),
    "executive": frozenset(
        {
            RUN_QUERY,
            VIEW_SQL,
            SAVE_REPORT,
            VIEW_QUALITY_CENTER,
        }
    ),
}


def normalize_role_key(role_key: Optional[str]) -> str:
    rk = (role_key or "").strip().lower()
    return rk if rk in ROLE_CAPABILITIES else "marketer"


def allowed_actions(role_key: Optional[str]) -> frozenset[str]:
    return ROLE_CAPABILITIES.get(normalize_role_key(role_key), ROLE_CAPABILITIES["marketer"])


def assert_role_capability(role_key: Optional[str], action: str) -> None:
    if action not in ALL_ACTIONS:
        raise ForbiddenException("Unknown capability", details={"action": action})
    rk = normalize_role_key(role_key)
    if action not in ROLE_CAPABILITIES.get(rk, frozenset()):
        raise ForbiddenException(
            "Недостаточно прав для действия",
            details={"action": action, "role": rk},
        )


def summarize_role_policy_ru(role_key: Optional[str]) -> str:
    rk = normalize_role_key(role_key)
    acts = ", ".join(sorted(allowed_actions(rk)))
    return f"Роль «{rk}»: разрешённые действия: {acts}."
