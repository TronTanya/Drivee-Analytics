export type SeededOrderRow = {
  city_id: string;
  status_order: "cancelled" | "done";
  status_tender: "client_cancelled" | "driver_timeout" | "completed";
  order_timestamp: string;
  price_order_local: number;
  duration_in_seconds: number;
  distance_in_meters: number;
};

export const SEEDED_ORDERS: SeededOrderRow[] = [
  {
    city_id: "Алматы",
    status_order: "cancelled",
    status_tender: "client_cancelled",
    order_timestamp: "2026-04-20T08:10:00Z",
    price_order_local: 1850,
    duration_in_seconds: 320,
    distance_in_meters: 4200
  },
  {
    city_id: "Алматы",
    status_order: "cancelled",
    status_tender: "driver_timeout",
    order_timestamp: "2026-04-20T10:25:00Z",
    price_order_local: 2100,
    duration_in_seconds: 450,
    distance_in_meters: 5600
  },
  {
    city_id: "Астана",
    status_order: "cancelled",
    status_tender: "client_cancelled",
    order_timestamp: "2026-04-20T11:05:00Z",
    price_order_local: 1700,
    duration_in_seconds: 290,
    distance_in_meters: 3600
  },
  {
    city_id: "Астана",
    status_order: "cancelled",
    status_tender: "driver_timeout",
    order_timestamp: "2026-04-21T07:50:00Z",
    price_order_local: 2350,
    duration_in_seconds: 520,
    distance_in_meters: 6100
  },
  {
    city_id: "Шымкент",
    status_order: "cancelled",
    status_tender: "client_cancelled",
    order_timestamp: "2026-04-21T09:30:00Z",
    price_order_local: 1490,
    duration_in_seconds: 260,
    distance_in_meters: 3400
  },
  {
    city_id: "Шымкент",
    status_order: "cancelled",
    status_tender: "driver_timeout",
    order_timestamp: "2026-04-21T13:42:00Z",
    price_order_local: 1780,
    duration_in_seconds: 390,
    distance_in_meters: 4700
  },
  {
    city_id: "Караганда",
    status_order: "done",
    status_tender: "completed",
    order_timestamp: "2026-04-20T15:11:00Z",
    price_order_local: 1950,
    duration_in_seconds: 480,
    distance_in_meters: 6400
  },
  {
    city_id: "Актобе",
    status_order: "done",
    status_tender: "completed",
    order_timestamp: "2026-04-21T16:25:00Z",
    price_order_local: 1320,
    duration_in_seconds: 310,
    distance_in_meters: 4100
  }
];

export type TopCityCancellationRow = {
  city_id: string;
  cancelled_orders: number;
  avg_price_order_local: number;
  avg_duration_in_seconds: number;
  avg_distance_in_meters: number;
};

export function topCityLimitFromPrompt(prompt: string, fallback = 3): number {
  const normalized = prompt.toLowerCase();
  const explicitNumberMatch = normalized.match(/топ[\s\-]*(\d{1,2})/i) ?? normalized.match(/top[\s\-]*(\d{1,2})/i);
  if (explicitNumberMatch) {
    const parsed = Number.parseInt(explicitNumberMatch[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  // "топ-n" means the user explicitly asked ranking size but left N as variable.
  if (/\b(топ|top)[\s\-]*n\b/i.test(normalized)) {
    return fallback;
  }
  return fallback;
}

export function topCityCancellations(limit = 3): TopCityCancellationRow[] {
  const map = new Map<
    string,
    { cancelled_orders: number; sumPrice: number; sumDuration: number; sumDistance: number }
  >();
  for (const row of SEEDED_ORDERS) {
    if (row.status_order !== "cancelled") continue;
    const current = map.get(row.city_id) ?? {
      cancelled_orders: 0,
      sumPrice: 0,
      sumDuration: 0,
      sumDistance: 0
    };
    current.cancelled_orders += 1;
    current.sumPrice += row.price_order_local;
    current.sumDuration += row.duration_in_seconds;
    current.sumDistance += row.distance_in_meters;
    map.set(row.city_id, current);
  }

  return [...map.entries()]
    .map(([city_id, value]) => ({
      city_id,
      cancelled_orders: value.cancelled_orders,
      avg_price_order_local: Math.round(value.sumPrice / value.cancelled_orders),
      avg_duration_in_seconds: Math.round(value.sumDuration / value.cancelled_orders),
      avg_distance_in_meters: Math.round(value.sumDistance / value.cancelled_orders)
    }))
    .sort((a, b) => b.cancelled_orders - a.cancelled_orders || a.city_id.localeCompare(b.city_id))
    .slice(0, limit);
}

export function deterministicSqlTopCancelledCities(limit = 3): string {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  return `SELECT
  city_id,
  COUNT(*) FILTER (
    WHERE clientcancel_timestamp IS NOT NULL
       OR drivercancel_timestamp IS NOT NULL
  ) AS cancelled_orders,
  AVG(price_order_local) AS avg_price_order_local,
  AVG(duration_in_seconds) AS avg_duration_in_seconds,
  AVG(distance_in_meters) AS avg_distance_in_meters
FROM public.train
WHERE (clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)
  AND order_timestamp >= DATE_TRUNC('week', CURRENT_DATE)
GROUP BY city_id
ORDER BY cancelled_orders DESC
LIMIT ${safeLimit};`;
}

/** Доля завершённых заказов по двум городам (детерминированный fallback для сравнительного сценария). */
export type ComparativeCityShareRow = {
  city_id: string;
  done_orders: number;
  total_orders: number;
  done_share: number;
};

export function comparativeDoneShareAlmatyAstana(): ComparativeCityShareRow[] {
  const cities = ["Алматы", "Астана"];
  return cities.map((city_id) => {
    const orders = SEEDED_ORDERS.filter((o) => o.city_id === city_id);
    const total = orders.length;
    const done = orders.filter((o) => o.status_order === "done").length;
    const done_share = total ? done / total : 0;
    return {
      city_id,
      done_orders: done,
      total_orders: total,
      done_share: Math.round(done_share * 1000) / 1000
    };
  });
}

export function deterministicSqlComparativeDoneShare(): string {
  return `SELECT city_id,
  COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL) AS done_orders,
  COUNT(DISTINCT order_id) AS total_orders,
  (COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL))::numeric
    / NULLIF(COUNT(DISTINCT order_id), 0) AS done_share
FROM public.train
WHERE city_id IN ('Алматы','Астана')
  AND order_timestamp >= CURRENT_DATE - INTERVAL '14 day'
GROUP BY city_id
ORDER BY city_id;`;
}

/** Агрегат отмен по календарным дням из демо-датасета (fallback «регулярной отчётности»). */
export type DailyCancellationRow = { day: string; cancellations: number };

export function dailyCancelledOrdersByDay(): DailyCancellationRow[] {
  const map = new Map<string, number>();
  for (const row of SEEDED_ORDERS) {
    if (row.status_order !== "cancelled") continue;
    const day = row.order_timestamp.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cancellations]) => ({ day, cancellations }));
}

export function deterministicSqlDailyCancellations(): string {
  return `SELECT date_trunc('day', order_timestamp)::date AS day,
  COUNT(*) FILTER (
    WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL
  )::bigint AS cancellations
FROM public.train
WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day'
GROUP BY 1
ORDER BY 1;`;
}

/** Детерминированные метрики по каналам (fallback; в SEEDED_ORDERS нет канала — фиксированный демо-срез). */
export type ChannelFunnelRow = {
  order_channel: string;
  orders: number;
  completed: number;
  conversion: number;
};

export function demoChannelFunnelRows(): ChannelFunnelRow[] {
  return [
    { order_channel: "app", orders: 42, completed: 31, conversion: 0.738 },
    { order_channel: "web", orders: 28, completed: 19, conversion: 0.679 },
    { order_channel: "partner", orders: 14, completed: 10, conversion: 0.714 }
  ];
}

export function deterministicSqlChannelConversion(): string {
  return `SELECT order_channel::text AS order_channel,
  COUNT(*)::bigint AS orders,
  COUNT(*) FILTER (WHERE status_order = 'done')::bigint AS completed,
  (COUNT(*) FILTER (WHERE status_order = 'done'))::numeric / NULLIF(COUNT(*), 0) AS conversion
FROM public.train
WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day'
GROUP BY 1
ORDER BY orders DESC;`;
}

export type DailyRevenueRow = { day: string; revenue: number };

export function dailyRevenueDoneByDay(): DailyRevenueRow[] {
  const map = new Map<string, number>();
  for (const row of SEEDED_ORDERS) {
    if (row.status_order !== "done") continue;
    const day = row.order_timestamp.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + row.price_order_local);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, revenue]) => ({ day, revenue: Math.round(revenue) }));
}

export function deterministicSqlDailyRevenue(): string {
  return `SELECT date_trunc('day', order_timestamp)::date AS day,
  SUM(price_order_local)::numeric AS revenue
FROM public.train
WHERE status_order = 'done'
  AND order_timestamp >= CURRENT_DATE - INTERVAL '14 day'
GROUP BY 1
ORDER BY 1;`;
}

export type CityShareRow = { city_id: string; orders: number; share: number };

export function shareOrdersByCityForDonut(): CityShareRow[] {
  const map = new Map<string, number>();
  for (const row of SEEDED_ORDERS) {
    map.set(row.city_id, (map.get(row.city_id) ?? 0) + 1);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .map(([city_id, orders]) => ({
      city_id,
      orders,
      share: Math.round((orders / total) * 1000) / 1000
    }))
    .sort((a, b) => b.orders - a.orders);
}

export function deterministicSqlShareByCity(): string {
  return `SELECT city_id::text AS city_id,
  COUNT(*)::bigint AS orders,
  COUNT(*)::numeric / SUM(COUNT(*)) OVER () AS share
FROM public.train
WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day'
GROUP BY 1
ORDER BY orders DESC;`;
}

export function deterministicSqlGeoMapCities(): string {
  return `SELECT city_id::text AS city_id,
  COUNT(*) FILTER (WHERE status_order = 'cancelled')::bigint AS cancellations_total
FROM public.train
WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day'
GROUP BY 1
ORDER BY cancellations_total DESC
LIMIT 12;`;
}
