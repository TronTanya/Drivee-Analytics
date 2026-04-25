#!/usr/bin/env python3
"""
Импорт строк из CSV в public.anonymized_incity_orders (VIEW public.train читает оттуда же).

Ожидается заголовок как в экспорте (в т.ч. MPIT `incity.csv`): city_id,order_id,tender_id,user_id,driver_id,offset_hours,...
Колонка order_channel в файле не обязательна — подставится 'unknown'.
Пустой tender_id в CSV заменяется на уникальный плейсхолдер `__no_tender__{n}` для PK.

Пример (внутри контейнера backend, DATABASE_URL уже на postgres):
  python scripts/import_train_csv.py --path /tmp/train.csv --limit 16000 --replace

С хоста через compose см. scripts/import_train_csv_docker.sh
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

NUM_COLS = [
    "distance_in_meters",
    "duration_in_seconds",
    "price_order_local",
    "price_tender_local",
    "price_start_local",
]


def _fill_empty_tender_ids(df: pd.DataFrame) -> pd.DataFrame:
    """Пустой tender_id (например MPIT) — уникальный surrogate для составного PK."""
    out = df.copy()
    if "tender_id" not in out.columns:
        return out
    tid = out["tender_id"].fillna("").astype(str).str.strip().replace("nan", "", regex=False)
    mask = tid.str.len().eq(0)
    if not mask.any():
        return out
    vals = np.array([f"__no_tender__{i}" for i in range(len(out))], dtype=object)
    out.loc[mask, "tender_id"] = vals[mask.to_numpy()]
    return out


def _drop_invalid_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Строки без части NOT NULL / PK полей ломают INSERT — отбрасываем."""
    out = df.copy()
    str_pk = ["city_id", "order_id", "tender_id", "user_id", "driver_id", "status_order", "status_tender"]
    for c in str_pk:
        if c not in out.columns:
            continue
        out[c] = out[c].fillna("").astype(str).str.strip().replace("nan", "", regex=False)
    mask = (
        out["city_id"].str.len().gt(0)
        & out["order_id"].str.len().gt(0)
        & out["tender_id"].str.len().gt(0)
        & out["user_id"].str.len().gt(0)
        & out["driver_id"].str.len().gt(0)
        & out["status_order"].str.len().gt(0)
        & out["status_tender"].str.len().gt(0)
    )
    dropped = int((~mask).sum())
    if dropped:
        print(f"Warning: dropped {dropped} rows with empty PK / required text fields", file=sys.stderr)
    return out.loc[mask].reset_index(drop=True)


def _normalize_frame(df: pd.DataFrame) -> pd.DataFrame:
    if "order_channel" not in df.columns:
        df = df.copy()
        df["order_channel"] = "unknown"
    for c in TS_COLS:
        if c in df.columns:
            df[c] = pd.to_datetime(df[c], utc=True, errors="coerce", format="mixed")
    for c in NUM_COLS:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    if "offset_hours" in df.columns:
        df["offset_hours"] = pd.to_numeric(df["offset_hours"], errors="coerce").fillna(0).astype("int64")
    return df


def main() -> int:
    p = argparse.ArgumentParser(description="Import train-shaped CSV into anonymized_incity_orders")
    p.add_argument("--path", type=Path, required=True, help="Path to CSV inside container or mounted volume")
    p.add_argument(
        "--limit",
        type=int,
        default=16_000,
        help="Max data rows to read (excluding header). Default 16000. Use -1 for entire file.",
    )
    p.add_argument(
        "--replace",
        action="store_true",
        help="DELETE all rows from anonymized_incity_orders before import (dev DB only).",
    )
    args = p.parse_args()

    path: Path = args.path.expanduser().resolve()
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    nrows = None if args.limit == -1 else args.limit
    df = pd.read_csv(path, nrows=nrows, low_memory=False)
    if df.empty:
        print("CSV is empty after read.", file=sys.stderr)
        return 1

    df = _normalize_frame(df)
    df = _fill_empty_tender_ids(df)
    required = {
        "city_id",
        "order_id",
        "tender_id",
        "user_id",
        "driver_id",
        "offset_hours",
        "status_order",
        "status_tender",
    }
    missing = required - set(df.columns)
    if missing:
        print(f"Missing columns: {sorted(missing)}", file=sys.stderr)
        return 1

    df = _drop_invalid_rows(df)
    if df.empty:
        print("No valid rows left after filtering empty PK fields.", file=sys.stderr)
        return 1

    table_cols = [
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
    for c in table_cols:
        if c not in df.columns:
            df[c] = None
    df = df[table_cols]

    with engine.begin() as conn:
        if args.replace:
            conn.execute(text("DELETE FROM public.anonymized_incity_orders"))
        df.to_sql(
            "anonymized_incity_orders",
            con=conn,
            schema="public",
            if_exists="append",
            index=False,
            method="multi",
            chunksize=2000,
        )
        n = conn.execute(text("SELECT COUNT(*) FROM public.anonymized_incity_orders")).scalar_one()
    print(f"OK: rows in anonymized_incity_orders (and train VIEW) = {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
