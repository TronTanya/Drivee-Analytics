"""Semantic layer: synonym -> SQL expression for anonymized in-city orders."""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.orchestration import SemanticTermResolution


@dataclass(frozen=True)
class TermDefinition:
    key: str
    patterns: tuple[str, ...]
    sql_expression: str
    description: str = ""
    requires_join_campaigns: bool = False


class SemanticService:
    """Built-in dictionary aligned with canonical `anonymized_incity_orders` source."""

    TERMS: tuple[TermDefinition, ...] = (
        TermDefinition(
            "orders_count",
            ("заказ", "orders", "количество заказов"),
            "COUNT(*)",
            "Количество заказов",
        ),
        TermDefinition(
            "tenders_count",
            ("тендер", "tender"),
            "COUNT(DISTINCT a.tender_id)",
            "Количество тендеров",
        ),
        TermDefinition(
            "client_cancellations",
            ("отмен клиент", "client cancel", "клиент отмен"),
            "COUNT(CASE WHEN a.clientcancel_timestamp IS NOT NULL THEN 1 END)",
            "Количество отмен клиентом",
        ),
        TermDefinition(
            "driver_cancellations",
            ("отмен водител", "driver cancel", "водитель отмен"),
            "COUNT(CASE WHEN a.drivercancel_timestamp IS NOT NULL THEN 1 END)",
            "Количество отмен водителем",
        ),
        TermDefinition(
            "cancellations_total",
            (
                "количество отмен",
                "отмененных заказ",
                "отменённых заказ",
                "cancelled orders",
                "total cancellations",
            ),
            (
                "COUNT(CASE WHEN a.clientcancel_timestamp IS NOT NULL "
                "OR a.drivercancel_timestamp IS NOT NULL THEN 1 END)"
            ),
            "Общее количество отмен заказов",
        ),
        TermDefinition(
            "done_rides",
            ("заверш", "done", "выполн"),
            "COUNT(CASE WHEN a.driverdone_timestamp IS NOT NULL THEN 1 END)",
            "Количество завершенных поездок",
        ),
        TermDefinition(
            "avg_order_price",
            ("средн стоимость", "средний чек", "average price"),
            "AVG(a.price_order_local)",
            "Средняя стоимость заказа",
        ),
        TermDefinition(
            "sum_order_price",
            ("суммарн стоимость", "сумма заказ", "total price"),
            "SUM(a.price_order_local)",
            "Суммарная стоимость заказов",
        ),
        TermDefinition(
            "avg_duration_seconds",
            ("средн длитель", "average duration"),
            "AVG(a.duration_in_seconds)",
            "Средняя длительность заказа в секундах",
        ),
        TermDefinition(
            "avg_distance_meters",
            ("средн дистанц", "average distance"),
            "AVG(a.distance_in_meters)",
            "Средняя дистанция в метрах",
        ),
        TermDefinition(
            "done_conversion",
            ("конверсия в заверш", "done conversion"),
            (
                "COUNT(CASE WHEN a.driverdone_timestamp IS NOT NULL THEN 1 END)::float "
                "/ NULLIF(COUNT(*), 0)"
            ),
            "Конверсия заказа в завершенную поездку",
        ),
        TermDefinition(
            "time_to_accept_seconds",
            ("время до принят", "time to accept"),
            (
                "AVG(EXTRACT(EPOCH FROM (a.driveraccept_timestamp::timestamp - a.order_timestamp::timestamp)))"
            ),
            "Среднее время до принятия заказа водителем",
        ),
        TermDefinition(
            "time_to_arrive_seconds",
            ("время до прибыт", "time to arrive"),
            (
                "AVG(EXTRACT(EPOCH FROM (a.driverarrived_timestamp::timestamp - a.driveraccept_timestamp::timestamp)))"
            ),
            "Среднее время до прибытия водителя",
        ),
        TermDefinition(
            "cancel_before_accept_count",
            ("до принят", "before accept"),
            "COUNT(CASE WHEN a.cancel_before_accept_local IS NOT NULL THEN 1 END)",
            "Количество отмен до принятия заказа",
        ),
    )

    def resolve(self, query: str) -> list[SemanticTermResolution]:
        q = query.lower()
        hits: list[SemanticTermResolution] = []
        for t in self.TERMS:
            for pat in t.patterns:
                if pat in q:
                    hits.append(
                        SemanticTermResolution(
                            term_key=t.key,
                            surface_form=pat,
                            sql_fragment=t.sql_expression,
                            confidence=0.9 if not t.requires_join_campaigns else 0.85,
                        )
                    )
                    break
        if hits:
            cancellation_priority: dict[str, int] = {
                "client_cancellations": 0,
                "driver_cancellations": 1,
                "cancellations_total": 2,
            }
            if "отмен" in q or "cancel" in q:
                hits.sort(key=lambda h: cancellation_priority.get(h.term_key, 20))
        if not hits:
            hits.append(
                SemanticTermResolution(
                    term_key="orders_count",
                    surface_form="default",
                    sql_fragment="COUNT(*)",
                    confidence=0.55,
                )
            )
        return hits

    def primary_metric_sql(self, resolutions: list[SemanticTermResolution]) -> str:
        if not resolutions:
            return "COUNT(*)"
        return resolutions[0].sql_fragment

    def needs_marketing_join(self, query: str) -> bool:
        return False
