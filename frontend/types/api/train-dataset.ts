/** GET /api/v1/workspaces/{id}/dashboards/train-summary */
export type TrainDatasetSummaryDto = {
  source_table: string;
  train_row_count: number;
  distinct_orders: number;
  done_rides: number;
  cancellations_total: number;
  order_timestamp_min?: string | null;
  order_timestamp_max?: string | null;
  /** Для роли executive бэкенд не отдаёт поле (null). */
  sum_order_price?: number | null;
};
