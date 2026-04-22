"""Map friendly schedule settings to cron + next run (UTC)."""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from typing import Literal

Frequency = Literal["daily", "weekly", "monthly"]


def frequency_to_cron(
    frequency: Frequency,
    hour_utc: int,
    minute: int = 0,
    *,
    day_of_week: int = 0,
    day_of_month: int = 1,
) -> str:
    """day_of_week: 0=Monday .. 6=Sunday (ISO-style)."""
    h, m = hour_utc, minute
    if frequency == "daily":
        return f"{m} {h} * * *"
    if frequency == "weekly":
        # cron DOW: 0-6 Sun-Sat → convert from Monday=0
        cron_dow = (day_of_week + 1) % 7
        return f"{m} {h} * * {cron_dow}"
    dom = max(1, min(day_of_month, 31))
    return f"{m} {h} {dom} * *"


def compute_next_run_utc(
    frequency: Frequency,
    hour_utc: int,
    minute: int = 0,
    *,
    day_of_week: int = 0,
    day_of_month: int = 1,
) -> datetime:
    now = datetime.now(timezone.utc)
    h, m = hour_utc, minute
    if frequency == "daily":
        cand = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if cand <= now:
            cand += timedelta(days=1)
        return cand
    if frequency == "weekly":
        cand = now.replace(hour=h, minute=m, second=0, microsecond=0)
        days_ahead = (day_of_week - cand.weekday()) % 7
        cand = cand + timedelta(days=days_ahead)
        if cand <= now:
            cand += timedelta(days=7)
        return cand
    y, mo = now.year, now.month
    dom = max(1, min(day_of_month, 31))
    last = calendar.monthrange(y, mo)[1]
    day = min(dom, last)
    cand = datetime(y, mo, day, h, m, tzinfo=timezone.utc)
    if cand <= now:
        if mo == 12:
            y += 1
            mo = 1
        else:
            mo += 1
        last = calendar.monthrange(y, mo)[1]
        day = min(dom, last)
        cand = datetime(y, mo, day, h, m, tzinfo=timezone.utc)
    return cand
