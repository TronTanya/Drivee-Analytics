from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import uuid
from typing import Any, Optional

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationException
from app.models.data_pipeline import DataImportJob, InferredSchema, UploadedFile
from app.repositories.data_pipeline_repository import DataPipelineRepository


def _sanitize_ident(name: str) -> str:
    raw = re.sub(r"[^a-zA-Z0-9_]+", "_", (name or "").strip()).lower()
    if not raw:
        return "col"
    if raw[0].isdigit():
        raw = "c_" + raw
    return raw[:63]


def validate_csv_upload(filename: str, raw: bytes) -> None:
    if not filename.lower().endswith(".csv"):
        raise ValidationException("Only CSV files are allowed")
    max_b = settings.csv_max_upload_mb * 1024 * 1024
    if len(raw) > max_b:
        raise ValidationException(f"File exceeds limit of {settings.csv_max_upload_mb} MB")
    if not raw.strip():
        raise ValidationException("Empty file")
    sample = raw[:4096]
    if b"\x00" in sample:
        raise ValidationException("Binary content is not allowed; upload a text CSV")


def detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except Exception:
        pass
    head = sample.split("\n")[0] if sample else ""
    for sep in [",", ";", "\t", "|"]:
        if sep in head:
            return sep
    return ","


def infer_pandas_dtypes(df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    columns: list[dict[str, Any]] = []
    for orig in df.columns:
        name = str(orig)
        s = df[name]
        null_ratio = float(s.isna().mean()) if len(s) else 0.0
        if null_ratio > 0.35:
            warnings.append(f"Колонка «{name}»: высокая доля пропусков ({null_ratio:.0%})")
        inferred = "string"
        pg = "TEXT"
        if pd.api.types.is_numeric_dtype(s):
            inferred = "number"
            if pd.api.types.is_integer_dtype(s):
                pg = "BIGINT"
            else:
                pg = "DOUBLE PRECISION"
        else:
            try:
                pd.to_datetime(s.dropna().iloc[: min(200, len(s))], errors="raise")
                inferred = "datetime"
                pg = "TIMESTAMPTZ"
            except Exception:
                pass
        columns.append(
            {
                "original_name": name,
                "sanitized_name": _sanitize_ident(name),
                "inferred_type": inferred,
                "pg_type": pg,
                "null_ratio": round(null_ratio, 4),
            }
        )
    return columns, warnings


def clean_dataframe(df: pd.DataFrame, column_meta: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, Any]]:
    out = df.copy()
    rename = {m["original_name"]: m["sanitized_name"] for m in column_meta}
    out = out.rename(columns=rename)
    log: dict[str, Any] = {"stripped_strings": 0, "coerced_numeric": [], "parsed_dates": []}
    for m in column_meta:
        c = m["sanitized_name"]
        if c not in out.columns:
            continue
        if m["inferred_type"] == "string":
            if out[c].dtype == object:
                out[c] = out[c].apply(lambda x: str(x).strip() if pd.notna(x) else x)
                log["stripped_strings"] += 1
        elif m["inferred_type"] == "number":
            coerced = pd.to_numeric(out[c], errors="coerce")
            if not coerced.equals(out[c]):
                log["coerced_numeric"].append(c)
            out[c] = coerced
        elif m["inferred_type"] == "datetime":
            out[c] = pd.to_datetime(out[c], errors="coerce", utc=True)
            log["parsed_dates"].append(c)
    return out, log


def infer_semantic_map_from_dataframe(df: pd.DataFrame) -> dict[str, str]:
    meta = [{"sanitized_name": str(c), "original_name": str(c)} for c in df.columns]
    return semantic_column_map(meta)


def semantic_column_map(column_meta: list[dict[str, Any]]) -> dict[str, str]:
    """Map metric keys to sanitized column names."""
    synonyms: dict[str, list[str]] = {
        "orders_count": ["orders_count", "orders", "order_count", "order_id", "заказы"],
        "tenders_count": ["tenders_count", "tender_count", "tender_id", "тендер"],
        "done_rides": ["done_rides", "driverdone_timestamp", "completed", "finished"],
        "client_cancellations": ["client_cancellations", "clientcancel_timestamp", "client_cancel"],
        "driver_cancellations": ["driver_cancellations", "drivercancel_timestamp", "driver_cancel"],
        "cancellations_total": ["cancellations_total", "cancel_before_accept_local", "cancel"],
        "sum_order_price": ["sum_order_price", "price_order_local", "order_price"],
        "avg_order_price": ["avg_order_price", "price_order_local"],
        "avg_duration_seconds": ["avg_duration_seconds", "duration_in_seconds", "duration"],
        "avg_distance_meters": ["avg_distance_meters", "distance_in_meters", "distance"],
        "time_to_accept_seconds": ["time_to_accept_seconds", "driveraccept_timestamp"],
        "time_to_arrive_seconds": ["time_to_arrive_seconds", "driverarrived_timestamp"],
        "city_id": ["city_id", "city"],
        "status_order": ["status_order"],
        "status_tender": ["status_tender"],
        "date": ["order_timestamp", "date", "dt", "day", "timestamp"],
    }
    lower_map = {m["sanitized_name"].lower(): m["sanitized_name"] for m in column_meta}
    result: dict[str, str] = {}
    for key, words in synonyms.items():
        for w in words:
            for san, orig in lower_map.items():
                if w == san or w in san:
                    result.setdefault(key, orig)
                    break
            if key in result:
                break
    return result


def process_csv_bytes(
    raw: bytes,
    filename: str,
    *,
    max_rows: Optional[int] = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    validate_csv_upload(filename, raw)
    text_sample = raw[:8192].decode("utf-8", errors="replace")
    sep = detect_delimiter(text_sample)
    buf = io.BytesIO(raw)
    read_kw: dict[str, Any] = dict(sep=sep, engine="c", low_memory=False)
    if max_rows is not None:
        read_kw["nrows"] = max_rows
    df = pd.read_csv(buf, **read_kw)
    if df.empty or len(df.columns) == 0:
        raise ValidationException("CSV has no columns or rows")
    column_meta, warns = infer_pandas_dtypes(df)
    df_clean, cleaning = clean_dataframe(df, column_meta)
    mapping = semantic_column_map(column_meta)
    preview = df_clean.head(20).replace({pd.NA: None}).to_dict(orient="records")
    for r in preview:
        for k, v in list(r.items()):
            if hasattr(v, "isoformat"):
                r[k] = v.isoformat()
    approx_total = max(0, raw.count(b"\n") - 1)
    schema_doc = {
        "delimiter": sep,
        "encoding": "utf-8",
        "row_count": int(len(df_clean)),
        "approximate_total_rows": approx_total,
        "columns": column_meta,
        "sample_rows": preview,
        "warnings": warns,
        "semantic_column_map": mapping,
        "cleaning": cleaning,
    }
    return df_clean, schema_doc


def persist_upload_and_job(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    raw: bytes,
) -> tuple[UploadedFile, DataImportJob]:
    _, schema_doc = process_csv_bytes(
        raw, filename, max_rows=settings.csv_inference_max_rows
    )
    os.makedirs(settings.csv_upload_dir, exist_ok=True)
    upload_id = uuid.uuid4()
    path = os.path.join(settings.csv_upload_dir, f"{upload_id}.csv")
    with open(path, "wb") as f:
        f.write(raw)
    checksum = hashlib.sha256(raw).hexdigest()
    up = UploadedFile(
        id=upload_id,
        workspace_id=workspace_id,
        uploaded_by=user_id,
        file_name=filename,
        mime_type="text/csv",
        storage_path=path,
        file_size_bytes=len(raw),
        checksum_sha256=checksum,
        upload_status="uploaded",
    )
    repo = DataPipelineRepository(session)
    repo.add_upload(up)
    job = DataImportJob(
        workspace_id=workspace_id,
        uploaded_file_id=up.id,
        initiated_by=user_id,
        job_type="csv_import",
        job_status="queued",
        source_schema_json=schema_doc,
        transform_config_json={"cleaning_applied": schema_doc.get("cleaning"), "imported": False},
    )
    repo.add_job(job)
    inf = InferredSchema(
        import_job_id=job.id,
        schema_version=1,
        inferred_schema_json={"columns": schema_doc["columns"]},
        column_stats_json={c["sanitized_name"]: {"null_ratio": c["null_ratio"]} for c in schema_doc["columns"]},
        quality_flags_json={"warnings": schema_doc.get("warnings", [])},
        confidence_score=0.85,
    )
    repo.add_inferred(inf)
    return up, job


def import_upload_to_postgres(
    session: Session,
    upload: UploadedFile,
    job: DataImportJob,
) -> dict[str, Any]:
    from app.db.session import engine

    if not os.path.isfile(upload.storage_path):
        raise ValidationException("Upload file missing on disk")
    with open(upload.storage_path, "rb") as fh:
        raw = fh.read()
    df0, schema_doc = process_csv_bytes(raw, upload.file_name, max_rows=None)
    schema = settings.csv_staging_schema
    table = f"t_{upload.id.hex[:12]}"
    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        conn.commit()
    df0.to_sql(
        table,
        con=engine,
        schema=schema,
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=2000,
    )
    row_count = len(df0)
    job.job_status = "succeeded"
    job.rows_in = row_count
    job.rows_out = row_count
    job.started_at = job.started_at or job.created_at
    from app.utils.time import utc_now

    job.finished_at = utc_now()
    job.transform_config_json = {
        **(job.transform_config_json or {}),
        "imported": True,
        "target_schema": schema,
        "target_table": table,
        "qualified_table": f"{schema}.{table}",
        "semantic_column_map": schema_doc.get("semantic_column_map"),
    }
    session.add(job)
    session.flush()
    return {
        "qualified_table": f"{schema}.{table}",
        "row_count": row_count,
        "semantic_column_map": schema_doc.get("semantic_column_map"),
    }
