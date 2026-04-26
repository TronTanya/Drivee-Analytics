"""Человекочитаемые подписи колонок результата SQL (RU) для UI и экспорта."""

from __future__ import annotations

# Ключи — в нижнем регистре (PostgreSQL часто отдаёт имена полей lowercased).
_EXACT: dict[str, str] = {
    # Воронка / конверсии
    "created_orders": "Созданные заказы",
    "accepted_orders": "Принятые заказы",
    "completed_orders": "Завершённые поездки",
    "acceptance_conversion": "Конверсия в принятие, %",
    "completion_conversion": "Конверсия в завершение, %",
    "accepted_rows": "Принятые (строки)",
    "cancelled_rows": "Отменённые (строки)",
    "share": "Доля",
    # Типовой BI-триплет
    "bucket": "Дата",
    "dim": "Город",
    "value": "Значение",
    # География / измерения
    "city_id": "Город",
    "city": "Город",
    "order_channel": "Канал заказа",
    "status_order": "Статус заказа",
    "status_tender": "Статус тендера",
    "offset_hours": "Смещение UTC, ч",
    "month": "Месяц",
    "month_start": "Месяц",
    "day": "День",
    "week": "Неделя",
    # Метрики выручки / заказов
    "revenue_gmv": "Выручка (GMV)",
    "completed_rides": "Завершённые поездки",
    "avg_check": "Средний чек",
    "rides": "Поездки",
    "online_hours": "Онлайн, часы",
    "rides_per_online_hour": "Поездок на час онлайна",
    "orders_count": "Количество заказов",
    "distinct_orders": "Уникальные заказы",
    "done_rides": "Завершённые поездки",
    "client_cancellations": "Отмены клиента",
    "driver_cancellations": "Отмены водителя",
    "cancellations_total": "Отмены всего",
    "cancellation_rate": "Доля отмен",
    "cancelled_orders": "Отменённые заказы",
    "sum_order_price": "Сумма заказов",
    "avg_order_price": "Средний чек заказа",
    "avg_price_tender_local": "Средняя цена тендера",
    "avg_price_start_local": "Средняя стартовая цена",
    "price_tender_sum": "Сумма тендеров",
    "train_row_count": "Число строк",
    # Служебные / агрегаты
    "cnt": "Количество",
    "count": "Количество",
    "total": "Итого",
    "row_count": "Число строк",
    "_aggregate_label": "Категория",
    "_metric_label": "Показатель",
    "_metric_value": "Значение",
}


def sql_column_label_ru(column: str) -> str:
    """Возвращает подпись колонки для отображения; исходный ключ в данных не меняется."""
    raw = (column or "").strip()
    if not raw:
        return ""
    key = raw.strip('"').lower()

    if key in _EXACT:
        return _EXACT[key]

    lo = key
    if "accept" in lo or "принят" in lo:
        return "Принятие / принятые"
    if "cancel" in lo or "отмен" in lo:
        return "Отмены"
    if "done" in lo or "заверш" in lo or "complete" in lo:
        return "Завершения"
    if "conversion" in lo or "конверс" in lo:
        return "Конверсия, %"
    if "revenue" in lo or "price" in lo or "gmv" in lo or "руб" in lo:
        return "Сумма / деньги"
    if "rate" in lo or "share" in lo or "pct" in lo or lo.endswith("_pct"):
        return "Доля / %"
    if "timestamp" in lo or lo.endswith("_at") or lo.endswith("_ts"):
        return "Время"
    if lo.startswith("avg_") or "average" in lo:
        return "Среднее"
    if lo.startswith("sum_") or lo.startswith("total_"):
        return "Сумма"

    return raw.replace("_", " ").strip() or raw


def build_sql_column_labels_map(columns: list[str]) -> dict[str, str]:
    """Словарь исходное имя колонки → подпись RU (ключи — как в rows)."""
    out: dict[str, str] = {}
    for c in columns:
        if c is None:
            continue
        s = str(c)
        if not s:
            continue
        out[s] = sql_column_label_ru(s)
    return out
