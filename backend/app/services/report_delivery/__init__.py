"""Абстракция доставки отчётов по расписанию (email / in-app / webhook).

MVP: запись намерения доставки в JSON расписания без реальной отправки почты.
"""

from app.services.report_delivery.stub import record_schedule_delivery_stub

__all__ = ["record_schedule_delivery_stub"]
