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
FROM public.anonymized_incity_orders
WHERE (clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)
  AND order_timestamp >= DATE_TRUNC('week', CURRENT_DATE)
GROUP BY city_id
ORDER BY cancelled_orders DESC
LIMIT ${safeLimit};`;
}
