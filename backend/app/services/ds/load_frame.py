from __future__ import annotations

import os
import uuid

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import NotFoundException, ValidationException
from app.repositories.data_pipeline_repository import DataPipelineRepository
from app.services.ds.csv_workflow import infer_semantic_map_from_dataframe, process_csv_bytes


def quote_qualified_table(qualified: str) -> str:
    parts = qualified.split(".", 1)
    if len(parts) != 2:
        raise ValidationException("Invalid qualified table name")
    return f'"{parts[0]}"."{parts[1]}"'


def load_upload_dataframe(
    session: Session,
    *,
    upload_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> tuple[pd.DataFrame, dict[str, str]]:
    repo = DataPipelineRepository(session)
    up = repo.get_upload(upload_id)
    if not up or up.workspace_id != workspace_id:
        raise NotFoundException("Upload not found")
    job = repo.get_latest_job_for_upload(upload_id)
    if not job:
        raise ValidationException("No import job for this upload")

    tconf = job.transform_config_json or {}
    if tconf.get("imported") and tconf.get("qualified_table"):
        from app.db.session import engine

        q = quote_qualified_table(tconf["qualified_table"])
        df = pd.read_sql(f"SELECT * FROM {q}", engine)
        smap = dict(tconf.get("semantic_column_map") or {})
        if not smap:
            smap = infer_semantic_map_from_dataframe(df)
        return df, smap

    if not os.path.isfile(up.storage_path):
        raise ValidationException("CSV file missing on disk")
    raw = open(up.storage_path, "rb").read()
    df, schema_doc = process_csv_bytes(raw, up.file_name, max_rows=None)
    smap = dict(schema_doc.get("semantic_column_map") or infer_semantic_map_from_dataframe(df))
    return df, smap


def load_default_source_dataframe(source_table: str | None = None) -> tuple[pd.DataFrame, dict[str, str]]:
    from app.db.session import engine

    qualified = source_table or settings.ds_default_source_table
    q = quote_qualified_table(qualified)
    df = pd.read_sql(f"SELECT * FROM {q}", engine)
    if df.empty:
        raise ValidationException(f"Default source table {qualified} is empty")

    # Practical dataset adaptation for metric/forecast compatibility.
    if "orders_count" not in df.columns:
        df["orders_count"] = 1
    if "done_rides" not in df.columns:
        df["done_rides"] = df.get("driverdone_timestamp").notna().astype(int) if "driverdone_timestamp" in df.columns else 0
    if "client_cancellations" not in df.columns:
        df["client_cancellations"] = (
            df.get("clientcancel_timestamp").notna().astype(int) if "clientcancel_timestamp" in df.columns else 0
        )
    if "driver_cancellations" not in df.columns:
        df["driver_cancellations"] = (
            df.get("drivercancel_timestamp").notna().astype(int) if "drivercancel_timestamp" in df.columns else 0
        )
    if "cancellations_total" not in df.columns:
        df["cancellations_total"] = df["client_cancellations"] + df["driver_cancellations"]
    if "sum_order_price" not in df.columns:
        df["sum_order_price"] = pd.to_numeric(df.get("price_order_local"), errors="coerce").fillna(0)
    if "avg_order_price" not in df.columns:
        df["avg_order_price"] = df["sum_order_price"]
    if "avg_duration_seconds" not in df.columns:
        df["avg_duration_seconds"] = pd.to_numeric(df.get("duration_in_seconds"), errors="coerce").fillna(0)
    if "avg_distance_meters" not in df.columns:
        df["avg_distance_meters"] = pd.to_numeric(df.get("distance_in_meters"), errors="coerce").fillna(0)

    smap = {
        "date": "order_timestamp" if "order_timestamp" in df.columns else "",
        "orders_count": "orders_count",
        "done_rides": "done_rides",
        "client_cancellations": "client_cancellations",
        "driver_cancellations": "driver_cancellations",
        "cancellations_total": "cancellations_total",
        "sum_order_price": "sum_order_price",
        "avg_order_price": "avg_order_price",
        "avg_duration_seconds": "avg_duration_seconds",
        "avg_distance_meters": "avg_distance_meters",
        "city_id": "city_id" if "city_id" in df.columns else "",
    }
    smap = {k: v for k, v in smap.items() if v}
    if not smap:
        smap = infer_semantic_map_from_dataframe(df)
    return df, smap


def profile_default_source_table(source_table: str | None = None) -> dict[str, object]:
    from app.db.session import engine

    qualified = source_table or settings.ds_default_source_table
    q = quote_qualified_table(qualified)
    schema_name, table_name = qualified.split(".", 1)

    with engine.connect() as conn:
        row_count = conn.execute(text(f"SELECT COUNT(*) FROM {q}")).scalar_one()
        min_date = None
        max_date = None
        if table_name in {"train", "incity_orders"}:
            min_date = conn.execute(text(f"SELECT MIN(order_timestamp::timestamp) FROM {q}")).scalar_one()
            max_date = conn.execute(text(f"SELECT MAX(order_timestamp::timestamp) FROM {q}")).scalar_one()

        columns_raw = conn.execute(
            text(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = :schema_name AND table_name = :table_name
                ORDER BY ordinal_position
                """
            ),
            {"schema_name": schema_name, "table_name": table_name},
        ).all()
        columns = [{"name": c[0], "type": c[1]} for c in columns_raw]

        status_top = []
        if any(c["name"] == "status_order" for c in columns):
            top_raw = conn.execute(
                text(
                    f"""
                    SELECT status_order::text, COUNT(*)::bigint AS cnt
                    FROM {q}
                    GROUP BY 1
                    ORDER BY cnt DESC
                    LIMIT 10
                    """
                )
            ).all()
            status_top = [{"status_order": r[0], "count": int(r[1])} for r in top_raw]

    return {
        "source_table": qualified,
        "row_count": int(row_count),
        "columns_count": len(columns),
        "columns": columns,
        "min_date": min_date.isoformat() if hasattr(min_date, "isoformat") else None,
        "max_date": max_date.isoformat() if hasattr(max_date, "isoformat") else None,
        "status_order_top": status_top,
    }


def ensure_and_refresh_orders_analytics_mv() -> dict[str, object]:
    # Legacy endpoint kept for API compatibility.
    # In aligned mode we only refresh/check the canonical source table.
    profile = profile_default_source_table(source_table=settings.ds_default_source_table)
    return {"materialized_view": profile["source_table"], "rows": int(profile["row_count"])}
