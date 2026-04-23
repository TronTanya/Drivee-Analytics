from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol

from app.models.saved_report import ReportSchedule


class ReportDeliveryBackend(Protocol):
    """Контракт для реальных каналов (SMTP, Slack, webhook)."""

    def record_schedule_event(self, *, schedule: ReportSchedule, event: str, meta: dict[str, Any]) -> None: ...


class InAppStubDeliveryBackend:
    """Заглушка: только аудит в delivery_config_json.mock_delivery_log."""

    def record_schedule_event(self, *, schedule: ReportSchedule, event: str, meta: dict[str, Any]) -> None:
        cfg = dict(schedule.delivery_config_json or {})
        log = list(cfg.get("mock_delivery_log") or [])
        log.append(
            {
                "event": event,
                "at": datetime.now(timezone.utc).isoformat(),
                "channel": schedule.delivery_channel,
                "meta": meta,
            }
        )
        cfg["mock_delivery_log"] = log[-50:]
        schedule.delivery_config_json = cfg


_default_backend = InAppStubDeliveryBackend()


def record_schedule_delivery_stub(schedule: ReportSchedule, *, report_title: str) -> None:
    """Вызывается при создании/обновлении расписания — фиксируем intent доставки."""
    _default_backend.record_schedule_event(
        schedule=schedule,
        event="schedule_created",
        meta={"report_title": report_title, "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None},
    )
