#!/usr/bin/env python3
"""
Импорт трёх CSV Drivee/MPIT в PostgreSQL:
  incity.csv          → public.incity_orders
  pass_detail.csv     → public.passenger_daily_metrics
  driver_detail.csv   → public.driver_daily_metrics

Логические связи (без FK): см. docs/datasets/drivee-analytics-base-ru.md

Пример:
  docker compose exec backend python scripts/import_drivee_dataset.py \\
    --incity /data/incity.csv --replace-incity \\
    --pass-detail /data/pass_detail.csv --replace-pass \\
    --driver-detail /data/driver_detail.csv --replace-driver
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.db.session import engine

TS_COLS = [
    "order_timestamp",
    "tender_timestamp",
    "driveraccept_timestamp",
    "driverarrived_timestamp",
    "driverstarttheride_timestamp",
    "driverdone_timestamp",
    "clientcancel_timestamp",
    "drivercancel_timestamp",
    "order_modified_local",
    "cancel_before_accept_local",
]

PASS_COLS = [
    "city_id",
    "user_id",
    "order_date_part",
    "user_reg_date",
    "orders_count",
    "orders_cnt_with_tenders",
    "orders_cnt_accepted",
    "rides_count",
    "client_cancel_after_accept",
    "rides_time_sum_seconds",
    "online_time_sum_seconds",
]

DRIVER_COLS = [
    "city_id",
    "driver_id",
    "tender_date_part",
    "driver_reg_date",
    "orders",
    "orders_cnt_with_tenders",
    "orders_cnt_accepted",
    "rides_count",
    "client_cancel_after_accept",
    "rides_time_sum_seconds",
    "online_time_sum_seconds",
]


def _read_csv(path: Path, limit: int | None) -> pd.DataFrame:
    nrows = None if limit is None or limit < 0 else limit
    return pd.read_csv(path, nrows=nrows, low_memory=False)


def _strip_id_cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c not in out.columns:
            continue
        out[c] = out[c].fillna("").astype(str).str.strip().replace("nan", "", regex=False)
    return out


def _normalize_incity(df: pd.DataFrame) -> pd.DataFrame:
    if "order_channel" not in df.columns:
        df = df.copy()
        df["order_channel"] = "unknown"
    for c in TS_COLS:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], utc=True, errors="coerce", format="mixed")
    for c in ("price_order_local", "price_tender_local", "price_start_local"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in ("distance_in_meters", "duration_in_seconds"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").round().astype("Int64")
    if "offset_hours" in df.columns:
        df["offset_hours"] = pd.to_numeric(df["offset_hours"], errors="coerce").fillna(0).astype("int64")
    # tender_id пустой допустим (суррогатный PK = id)
    if "tender_id" in df.columns:
        tid = df["tender_id"].fillna("").astype(str).str.strip().replace("nan", "", regex=False)
        df["tender_id"] = tid.replace("", np.nan)
    return df


def _drop_bad_incity_rows(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    req = ["city_id", "order_id", "user_id", "driver_id", "status_order", "status_tender"]
    for c in req:
        if c not in out.columns:
            continue
        out[c] = out[c].fillna("").astype(str).str.strip().replace("nan", "", regex=False)
    mask = (
        out["city_id"].str.len().gt(0)
        & out["order_id"].str.len().gt(0)
        & out["user_id"].str.len().gt(0)
        & out["driver_id"].str.len().gt(0)
        & out["status_order"].str.len().gt(0)
        & out["status_tender"].str.len().gt(0)
    )
    dropped = int((~mask).sum())
    if dropped:
        print(f"incity: dropped {dropped} rows missing required fields", file=sys.stderr)
    return out.loc[mask].reset_index(drop=True)


def import_incity(path: Path, limit: int | None, replace: bool) -> int:
    df = _read_csv(path, limit)
    if df.empty:
        print("incity: empty file", file=sys.stderr)
        return 1
    req = {
        "city_id",
        "offset_hours",
        "order_id",
        "user_id",
        "driver_id",
        "status_order",
        "status_tender",
    }
    if not req <= set(df.columns):
        print(f"incity: missing columns {sorted(req - set(df.columns))}", file=sys.stderr)
        return 1
    df = _normalize_incity(df)
    df = _drop_bad_incity_rows(df)
    if df.empty:
        print("incity: no valid rows", file=sys.stderr)
        return 1
    cols = [
        "city_id",
        "offset_hours",
        "order_id",
        "tender_id",
        "user_id",
        "driver_id",
        "status_order",
        "status_tender",
        "order_timestamp",
        "tender_timestamp",
        "driveraccept_timestamp",
        "driverarrived_timestamp",
        "driverstarttheride_timestamp",
        "driverdone_timestamp",
        "clientcancel_timestamp",
        "drivercancel_timestamp",
        "order_modified_local",
        "cancel_before_accept_local",
        "distance_in_meters",
        "duration_in_seconds",
        "price_order_local",
        "price_tender_local",
        "price_start_local",
        "order_channel",
    ]
    for c in cols:
        if c not in df.columns:
            df[c] = None
    df = df[cols]
    with engine.begin() as conn:
        if replace:
            conn.execute(text("DELETE FROM public.incity_orders"))
        df.to_sql("incity_orders", con=conn, schema="public", if_exists="append", index=False, method="multi", chunksize=2000)
        n = conn.execute(text("SELECT COUNT(*) FROM public.incity_orders")).scalar_one()
    print(f"OK: incity_orders rows = {n}")
    return 0


def _coerce_date_series(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce", format="mixed").dt.date


def import_passenger(path: Path, limit: int | None, replace: bool) -> int:
    df = _read_csv(path, limit)
    if df.empty:
        print("pass_detail: empty", file=sys.stderr)
        return 1
    if not set(PASS_COLS) <= set(df.columns):
        print(f"pass_detail: missing {sorted(set(PASS_COLS) - set(df.columns))}", file=sys.stderr)
        return 1
    df = _strip_id_cols(df, ["city_id", "user_id"])
    df["order_date_part"] = _coerce_date_series(df["order_date_part"])
    if "user_reg_date" in df.columns:
        df["user_reg_date"] = _coerce_date_series(df["user_reg_date"])
    for c in PASS_COLS[4:]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    mask = df["city_id"].str.len().gt(0) & df["user_id"].str.len().gt(0) & df["order_date_part"].notna()
    df = df.loc[mask].reset_index(drop=True)
    if df.empty:
        print("pass_detail: no valid rows", file=sys.stderr)
        return 1
    dup = int(df.duplicated(subset=["city_id", "user_id", "order_date_part"], keep=False).sum())
    if dup:
        print(f"pass_detail: collapsing {dup} duplicate PK rows", file=sys.stderr)
    df = df.drop_duplicates(subset=["city_id", "user_id", "order_date_part"], keep="first").reset_index(drop=True)
    df = df[PASS_COLS]
    with engine.begin() as conn:
        if replace:
            conn.execute(text("DELETE FROM public.passenger_daily_metrics"))
        df.to_sql(
            "passenger_daily_metrics",
            con=conn,
            schema="public",
            if_exists="append",
            index=False,
            method="multi",
            chunksize=2000,
        )
        n = conn.execute(text("SELECT COUNT(*) FROM public.passenger_daily_metrics")).scalar_one()
    print(f"OK: passenger_daily_metrics rows = {n}")
    return 0


def import_driver(path: Path, limit: int | None, replace: bool) -> int:
    df = _read_csv(path, limit)
    if df.empty:
        print("driver_detail: empty", file=sys.stderr)
        return 1
    if not set(DRIVER_COLS) <= set(df.columns):
        print(f"driver_detail: missing {sorted(set(DRIVER_COLS) - set(df.columns))}", file=sys.stderr)
        return 1
    df = _strip_id_cols(df, ["city_id", "driver_id"])
    df["tender_date_part"] = _coerce_date_series(df["tender_date_part"])
    if "driver_reg_date" in df.columns:
        df["driver_reg_date"] = _coerce_date_series(df["driver_reg_date"])
    for c in DRIVER_COLS[4:]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    mask = df["city_id"].str.len().gt(0) & df["driver_id"].str.len().gt(0) & df["tender_date_part"].notna()
    df = df.loc[mask].reset_index(drop=True)
    if df.empty:
        print("driver_detail: no valid rows", file=sys.stderr)
        return 1
    dup = int(df.duplicated(subset=["city_id", "driver_id", "tender_date_part"], keep=False).sum())
    if dup:
        print(f"driver_detail: collapsing {dup} duplicate PK rows", file=sys.stderr)
    df = df.drop_duplicates(subset=["city_id", "driver_id", "tender_date_part"], keep="first").reset_index(drop=True)
    df = df[DRIVER_COLS]
    with engine.begin() as conn:
        if replace:
            conn.execute(text("DELETE FROM public.driver_daily_metrics"))
        df.to_sql(
            "driver_daily_metrics",
            con=conn,
            schema="public",
            if_exists="append",
            index=False,
            method="multi",
            chunksize=2000,
        )
        n = conn.execute(text("SELECT COUNT(*) FROM public.driver_daily_metrics")).scalar_one()
    print(f"OK: driver_daily_metrics rows = {n}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Import Drivee incity / pass / driver CSVs")
    p.add_argument("--incity", type=Path, default=None)
    p.add_argument("--pass-detail", type=Path, default=None)
    p.add_argument("--driver-detail", type=Path, default=None)
    p.add_argument("--limit", type=int, default=-1)
    p.add_argument("--replace-incity", action="store_true")
    p.add_argument("--replace-pass", action="store_true")
    p.add_argument("--replace-driver", action="store_true")
    args = p.parse_args()
    lim = None if args.limit == -1 else args.limit
    rc = 0
    if args.incity:
        path = args.incity.expanduser().resolve()
        if not path.is_file():
            print(f"Not found: {path}", file=sys.stderr)
            return 1
        rc |= import_incity(path, lim, args.replace_incity)
    if args.pass_detail:
        path = args.pass_detail.expanduser().resolve()
        if not path.is_file():
            print(f"Not found: {path}", file=sys.stderr)
            return 1
        rc |= import_passenger(path, lim, args.replace_pass)
    if args.driver_detail:
        path = args.driver_detail.expanduser().resolve()
        if not path.is_file():
            print(f"Not found: {path}", file=sys.stderr)
            return 1
        rc |= import_driver(path, lim, args.replace_driver)
    if not (args.incity or args.pass_detail or args.driver_detail):
        p.print_help()
        return 1
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
