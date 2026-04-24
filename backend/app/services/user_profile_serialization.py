from __future__ import annotations

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.auth import UserProfileMeResponse, UserProfilePatchRequest

PDF_MODE_KEY = "default_report_pdf_mode"
_VALID_MODES: frozenset[str] = frozenset({"compact", "board"})
_VALID_LOCALES: frozenset[str] = frozenset({"ru", "en"})


def profile_me_response(user: User) -> UserProfileMeResponse:
    p = user.profile
    if p is None:
        return UserProfileMeResponse()
    pj = dict(p.profile_json or {})
    raw = pj.get(PDF_MODE_KEY)
    mode: Literal["compact", "board"] = "board"
    if raw in _VALID_MODES:
        mode = raw  # type: ignore[assignment]
    loc = (p.locale or "ru").strip().lower() or "ru"
    if loc not in _VALID_LOCALES:
        loc = "ru"
    tz_raw = (p.timezone or "UTC").strip() or "UTC"
    try:
        ZoneInfo(tz_raw)
        tz_out = tz_raw
    except ZoneInfoNotFoundError:
        tz_out = "UTC"
    return UserProfileMeResponse(
        first_name=p.first_name,
        last_name=p.last_name,
        timezone=tz_out,
        locale=loc,
        default_report_pdf_mode=mode,
    )


def ensure_profile_row(session: Session, user: User) -> UserProfile:
    row = session.execute(select(UserProfile).where(UserProfile.user_id == user.id)).scalar_one_or_none()
    if row:
        return row
    row = UserProfile(user_id=user.id, timezone="UTC", locale="ru", profile_json={})
    session.add(row)
    session.flush()
    return row


def apply_profile_patch(session: Session, user: User, payload: UserProfilePatchRequest) -> None:
    p = ensure_profile_row(session, user)
    data = payload.model_dump(exclude_unset=True)
    mode = data.pop("default_report_pdf_mode", None)
    for key in ("first_name", "last_name", "timezone", "locale"):
        if key in data:
            setattr(p, key, data[key])
    if mode is not None:
        pj = dict(p.profile_json or {})
        pj[PDF_MODE_KEY] = mode
        p.profile_json = pj
    session.add(p)
