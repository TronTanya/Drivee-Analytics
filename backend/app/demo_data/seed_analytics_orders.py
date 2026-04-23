"""
Идемпотентная генерация объёмного демо-набора в public.anonymized_incity_orders.

Префикс order_id = DEMO- — строки с ним удаляются и вставляются заново при каждом seed.
Опорная дата: UTC-сегодня, чтобы шаблоны с CURRENT_DATE / date_trunc('week') оставались актуальными.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import delete

from app.models.business_demo import AnonymizedIncityOrder

# (city_id, offset_hours, price_multiplier, cancel_bias) — cancel_bias увеличивает долю отмен
DEMO_CITIES: tuple[tuple[str, int, float, float], ...] = (
    ("67", 5, 1.15, 0.12),
    ("101", 3, 1.0, 0.05),
    ("205", 3, 0.92, 0.06),
    ("310", 6, 0.88, 0.04),
    ("420", 4, 0.95, 0.07),
)

CHANNEL_WEIGHTS: tuple[tuple[str, float], ...] = (
    ("app", 0.5),
    ("web", 0.28),
    ("partner_api", 0.14),
    ("call_center", 0.08),
)

DEMO_ORDER_PREFIX = "DEMO-"
LOOKBACK_DAYS = 63  # ≥ 8 недель для weekly_conversion и запас по дням


def _utc_dt(day: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=timezone.utc)


def _rng(city_id: str, day: date, seq: int) -> random.Random:
    seed = (day.toordinal() << 16) ^ (hash(city_id) & 0xFFFF) ^ (seq * 7919)
    return random.Random(seed & 0xFFFFFFFF)


def _weighted_choice(rng: random.Random, items: tuple[tuple[str, float], ...]) -> str:
    r = rng.random()
    acc = 0.0
    for val, w in items:
        acc += w
        if r <= acc:
            return val
    return items[-1][0]


def _pick_outcome(rng: random.Random, cancel_bias: float) -> str:
    r = rng.random()
    done_thr = 0.58 - cancel_bias * 0.35
    if r < max(0.28, done_thr):
        return "done"
    if r < done_thr + 0.16:
        return "client_cancel"
    if r < done_thr + 0.24:
        return "driver_cancel"
    if r < done_thr + 0.31:
        return "search_expired"
    return "cancel_before_accept"


def _orders_for_day(rng: random.Random, day: date) -> int:
    base = 7 + rng.randint(0, 5)
    if day.weekday() >= 5:
        base += 3
    return base


def _build_row(
    *,
    city_id: str,
    offset_hours: int,
    day: date,
    seq: int,
    price_mult: float,
    cancel_bias: float,
) -> dict[str, Any]:
    rng = _rng(city_id, day, seq)
    order_id = f"{DEMO_ORDER_PREFIX}{city_id}-{day.strftime('%Y%m%d')}-{seq:04d}"
    tender_id = f"{order_id}-T1"
    channel = _weighted_choice(rng, CHANNEL_WEIGHTS)
    outcome = _pick_outcome(rng, cancel_bias)

    hour = 6 + rng.randint(0, 14)
    minute = rng.randint(0, 59)
    order_ts = _utc_dt(day, hour, minute)

    user_id = f"DEMO-U-{abs(hash((order_id, 'u'))) % 900_000 + 100_000}"
    driver_id = f"DEMO-D-{abs(hash((order_id, 'd'))) % 90_000 + 10_000}"

    base_price = round((280 + rng.random() * 520) * price_mult, 3)
    dist = round(1500 + rng.random() * 10000, 3)

    null: None = None
    row: dict[str, Any] = {
        "city_id": city_id,
        "offset_hours": offset_hours,
        "order_id": order_id,
        "tender_id": tender_id,
        "user_id": user_id,
        "driver_id": driver_id,
        "status_order": "created",
        "status_tender": "searching",
        "order_timestamp": order_ts,
        "tender_timestamp": null,
        "driveraccept_timestamp": null,
        "driverarrived_timestamp": null,
        "driverstarttheride_timestamp": null,
        "driverdone_timestamp": null,
        "clientcancel_timestamp": null,
        "drivercancel_timestamp": null,
        "order_modified_local": null,
        "cancel_before_accept_local": null,
        "distance_in_meters": null,
        "duration_in_seconds": null,
        "price_order_local": base_price,
        "price_tender_local": round(base_price * (0.96 + rng.random() * 0.03), 3),
        "price_start_local": round(base_price * (0.82 + rng.random() * 0.08), 3),
        "order_channel": channel,
    }

    def minutes(m: float) -> timedelta:
        return timedelta(minutes=int(m), seconds=int((m % 1) * 60))

    if outcome == "done":
        row["status_order"] = "done"
        row["status_tender"] = "matched"
        t0 = order_ts
        row["tender_timestamp"] = t0 + minutes(0.8 + rng.random() * 1.5)
        row["driveraccept_timestamp"] = row["tender_timestamp"] + minutes(1 + rng.random() * 2)
        row["driverarrived_timestamp"] = row["driveraccept_timestamp"] + minutes(4 + rng.random() * 6)
        row["driverstarttheride_timestamp"] = row["driverarrived_timestamp"] + minutes(1 + rng.random() * 2)
        ride_min = 8 + rng.random() * 35
        row["driverdone_timestamp"] = row["driverstarttheride_timestamp"] + minutes(ride_min)
        row["order_modified_local"] = row["driverdone_timestamp"]
        row["distance_in_meters"] = dist
        row["duration_in_seconds"] = round(ride_min * 60, 3)
        row["price_order_local"] = round(base_price * (0.95 + rng.random() * 0.12), 3)
        row["price_tender_local"] = round(float(row["price_order_local"]) * 0.99, 3)
    elif outcome == "client_cancel":
        row["status_order"] = "client_cancelled"
        row["status_tender"] = "matched" if rng.random() > 0.35 else "searching"
        row["tender_timestamp"] = order_ts + minutes(0.5 + rng.random())
        if row["status_tender"] == "matched":
            row["driveraccept_timestamp"] = row["tender_timestamp"] + minutes(1 + rng.random() * 3)
            cancel_at = row["driveraccept_timestamp"] + minutes(2 + rng.random() * 10)
        else:
            cancel_at = row["tender_timestamp"] + minutes(2 + rng.random() * 8)
        row["clientcancel_timestamp"] = cancel_at
        row["order_modified_local"] = cancel_at
        row["price_order_local"] = round(base_price * rng.choice([0, 0.15, 0.4]), 3)
        row["price_tender_local"] = row["price_order_local"]
        row["distance_in_meters"] = 0
        row["duration_in_seconds"] = round((cancel_at - order_ts).total_seconds(), 3)
    elif outcome == "driver_cancel":
        row["status_order"] = "driver_cancelled"
        row["status_tender"] = "matched"
        row["tender_timestamp"] = order_ts + minutes(0.6)
        row["driveraccept_timestamp"] = row["tender_timestamp"] + minutes(1.2)
        dc = row["driveraccept_timestamp"] + minutes(3 + rng.random() * 12)
        row["drivercancel_timestamp"] = dc
        row["order_modified_local"] = dc
        row["price_order_local"] = round(base_price * 0.25, 3)
        row["price_tender_local"] = row["price_order_local"]
        row["distance_in_meters"] = 0
        row["duration_in_seconds"] = round((dc - order_ts).total_seconds(), 3)
    elif outcome == "search_expired":
        row["status_order"] = "expired"
        row["status_tender"] = "expired"
        row["tender_timestamp"] = order_ts + minutes(0.4)
        exp = order_ts + minutes(12 + rng.random() * 20)
        row["order_modified_local"] = exp
        row["price_order_local"] = round(base_price * 0.1, 3)
        row["price_tender_local"] = row["price_order_local"]
        row["distance_in_meters"] = 0
        row["duration_in_seconds"] = round((exp - order_ts).total_seconds(), 3)
    else:  # cancel_before_accept
        row["status_order"] = "client_cancelled"
        row["status_tender"] = "searching"
        row["tender_timestamp"] = order_ts + minutes(0.3 + rng.random() * 0.8)
        cba = order_ts + minutes(0.8 + rng.random() * 2.5)
        row["clientcancel_timestamp"] = cba
        row["cancel_before_accept_local"] = cba
        row["order_modified_local"] = cba
        row["price_order_local"] = 0
        row["price_tender_local"] = 0
        row["distance_in_meters"] = 0
        row["duration_in_seconds"] = round((cba - order_ts).total_seconds(), 3)

    return row


def _iter_demo_rows(anchor: date) -> Iterable[dict[str, Any]]:
    for day_offset in range(LOOKBACK_DAYS):
        day = anchor - timedelta(days=LOOKBACK_DAYS - 1 - day_offset)
        for city_id, offset_hours, price_mult, cancel_bias in DEMO_CITIES:
            rng_day = _rng(city_id, day, 9999)
            n = _orders_for_day(rng_day, day)
            for seq in range(1, n + 1):
                yield _build_row(
                    city_id=city_id,
                    offset_hours=offset_hours,
                    day=day,
                    seq=seq,
                    price_mult=price_mult,
                    cancel_bias=cancel_bias,
                )


def chunked(seq: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def replace_demo_orders_dataset(session, *, anchor: date | None = None) -> int:
    """
    Удаляет DEMO-* заказы и вставляет свежий набор. Возвращает число вставленных строк.
    """
    anchor = anchor or date.today()
    session.execute(delete(AnonymizedIncityOrder).where(AnonymizedIncityOrder.order_id.like(f"{DEMO_ORDER_PREFIX}%")))
    rows = list(_iter_demo_rows(anchor))
    for part in chunked(rows, 250):
        session.add_all([AnonymizedIncityOrder(**row) for row in part])
    return len(rows)


if __name__ == "__main__":
    from app.db.session import SessionLocal

    with SessionLocal() as sess:
        inserted = replace_demo_orders_dataset(sess)
        sess.commit()
        print(f"Inserted {inserted} demo order rows (DEMO-*).")
