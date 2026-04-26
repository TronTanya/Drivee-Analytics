-- Агрегат за календарный месяц (UTC по order_timestamp): те же правила, что в qr_accepted_at_start_price_daily.sql

WITH bounds AS (
  SELECT
    timestamptz '2025-02-01 00:00:00+00' AS ts_start,
    timestamptz '2025-03-01 00:00:00+00' AS ts_end
),
base AS (
  SELECT
    o.order_id,
    date_trunc('month', o.order_timestamp AT TIME ZONE 'UTC')::date AS month_utc,
    o.price_order_local,
    o.price_start_local
  FROM public.incity_orders AS o
  CROSS JOIN bounds AS b
  WHERE o.order_timestamp >= b.ts_start
    AND o.order_timestamp < b.ts_end
    AND o.driveraccept_timestamp IS NOT NULL
    AND o.driveraccept_timestamp <= o.order_timestamp + interval '10 minutes'
    AND o.price_order_local IS NOT NULL
    AND o.price_start_local IS NOT NULL
)
SELECT
  month_utc AS month,
  COUNT(DISTINCT order_id) AS accepted_within_10m,
  COUNT(DISTINCT order_id) FILTER (
    WHERE price_order_local = price_start_local
  ) AS qr_strict_start_price,
  COUNT(DISTINCT order_id) FILTER (
    WHERE abs(price_order_local - price_start_local)
      <= greatest(1::numeric, 0.01 * abs(price_start_local))
  ) AS qr_start_price_within_1pct_or_1unit
FROM base
GROUP BY 1
ORDER BY 1;
