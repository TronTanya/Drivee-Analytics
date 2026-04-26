-- QR (качественная метрика): заказы, принятые водителем не позже 10 минут от создания заказа,
-- при условии совпадения итоговой цены заказа со стартовой (или с допуском — см. колонки).
-- Источник: public.incity_orders (= anonymized_incity_orders).
-- Период и тайзона: ниже — календарный месяц в UTC по order_timestamp; при бизнес-правиле «локальный день города»
--   замените привязку на (order_timestamp AT TIME ZONE ...) по политике продукта.

WITH bounds AS (
  SELECT
    timestamptz '2025-02-01 00:00:00+00' AS ts_start,
    timestamptz '2025-03-01 00:00:00+00' AS ts_end
),
base AS (
  SELECT
    o.order_id,
    date_trunc('day', o.order_timestamp AT TIME ZONE 'UTC')::date AS day_utc,
    o.order_timestamp,
    o.driveraccept_timestamp,
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
  day_utc AS day,
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
