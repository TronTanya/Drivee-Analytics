/** Подписи колонок результата SQL (RU) — fallback, если с бэкенда нет `column_labels`. */

const EXACT: Record<string, string> = {
  created_orders: "Созданные заказы",
  accepted_orders: "Принятые заказы",
  completed_orders: "Завершённые поездки",
  acceptance_conversion: "Конверсия в принятие, %",
  completion_conversion: "Конверсия в завершение, %",
  accepted_rows: "Принятые (строки)",
  cancelled_rows: "Отменённые (строки)",
  share: "Доля",
  bucket: "Дата",
  dim: "Город",
  value: "Значение",
  city_id: "Город",
  city: "Город",
  order_channel: "Канал заказа",
  status_order: "Статус заказа",
  status_tender: "Статус тендера",
  offset_hours: "Смещение UTC, ч",
  month: "Месяц",
  month_start: "Месяц",
  day: "День",
  week: "Неделя",
  revenue_gmv: "Выручка (GMV)",
  completed_rides: "Завершённые поездки",
  avg_check: "Средний чек",
  rides: "Поездки",
  online_hours: "Онлайн, часы",
  rides_per_online_hour: "Поездок на час онлайна",
  orders_count: "Количество заказов",
  distinct_orders: "Уникальные заказы",
  done_rides: "Завершённые поездки",
  client_cancellations: "Отмены клиента",
  driver_cancellations: "Отмены водителя",
  cancellations_total: "Отмены всего",
  cancellation_rate: "Доля отмен",
  cancelled_orders: "Отменённые заказы",
  sum_order_price: "Сумма заказов",
  avg_order_price: "Средний чек заказа",
  cnt: "Количество",
  count: "Количество",
  total: "Итого",
  row_count: "Число строк",
  _aggregate_label: "Категория",
  _metric_label: "Показатель",
  _metric_value: "Значение"
};

export function sqlColumnLabelRu(column: string): string {
  const raw = (column ?? "").trim();
  if (!raw) return "";
  const key = raw.replace(/^"|"$/g, "").toLowerCase();
  if (EXACT[key]) return EXACT[key];
  const lo = key;
  if (lo.includes("accept") || lo.includes("принят")) return "Принятие / принятые";
  if (lo.includes("cancel") || lo.includes("отмен")) return "Отмены";
  if (lo.includes("done") || lo.includes("заверш") || lo.includes("complete")) return "Завершения";
  if (lo.includes("conversion") || lo.includes("конверс")) return "Конверсия, %";
  if (lo.includes("revenue") || lo.includes("price") || lo.includes("gmv")) return "Сумма / деньги";
  if (lo.includes("rate") || lo.includes("share") || lo.includes("pct") || lo.endsWith("_pct")) return "Доля / %";
  if (lo.includes("timestamp") || lo.endsWith("_at") || lo.endsWith("_ts")) return "Время";
  if (lo.startsWith("avg_") || lo.includes("average")) return "Среднее";
  if (lo.startsWith("sum_") || lo.startsWith("total_")) return "Сумма";
  return raw.split("_").join(" ").trim() || raw;
}
