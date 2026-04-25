from __future__ import annotations

from functools import lru_cache
import json

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

KNOWN_APP_ENVS = {"dev", "demo", "local", "test", "ci", "prod", "production"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Drivee Analytics Notebook API"
    app_env: str = "dev"
    app_version: str = "0.1.0"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    cors_origins: list[str] | str = ["http://localhost:3000", "http://localhost:3001"]

    # В prod задайте через окружение; пустое значение в dev обрабатывается в app.core.security.
    jwt_secret: str = ""
    jwt_refresh_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_exp_minutes: int = 60
    refresh_token_exp_days: int = 7

    postgres_host: str = "localhost"
    postgres_port: int = 55432
    postgres_db: str = "drivee_analytics"
    postgres_user: str = "drivee"
    postgres_password: str = "drivee"
    database_url: str = ""
    db_echo: bool = False
    db_pool_size: int = 10
    db_max_overflow: int = 20

    mock_mode: bool = False
    # Если true и MOCK_MODE=false: при ошибке выполнения SQL в Postgres вернуть stub-строки (демо без падения UI).
    mock_sql_execution_fallback: bool = False
    sql_default_limit: int = 1000
    sql_timeout_seconds: int = 8
    # Аналитический MVP: по умолчанию запрещаем UNION (снижает риск обхода allowlist).
    sql_allow_union: bool = False
    # Продуктивный режим: запрет SELECT * / alias.* (кроме COUNT(*) внутри выражений).
    sql_forbid_select_star: bool = True
    # Все обращения alias.col к физическим таблицам — только из sql_whitelist_columns.
    sql_enforce_global_column_whitelist: bool = True
    # Для этих intent LIMIT обязателен (подставляется валидатором, если отсутствует).
    sql_intents_require_limit: list[str] | str = [
        "ranking",
        "geo",
        "comparison",
        "share",
        "trend",
        "forecast",
    ]
    sql_whitelist_tables: list[str] | str = [
        "train",
        "user_staging",
    ]
    # Схемы, в которых разрешены физические таблицы в FROM/JOIN (unqualified → sql_implicit_schema).
    sql_whitelist_schemas: list[str] | str = ["public", "user_staging"]
    sql_implicit_schema: str = "public"
    # Имена загруженных staging-таблиц (см. csv_workflow: t_ + 12 hex).
    sql_staging_upload_table_pattern: str = r"^t_[a-f0-9]{12}$"
    sql_whitelist_columns: list[str] | str = [
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

    csv_upload_dir: str = "var/csv_uploads"
    csv_max_upload_mb: int = 50
    csv_staging_schema: str = "user_staging"
    csv_inference_max_rows: int = 100_000
    ds_default_source_table: str = "public.train"
    # Если False (по умолчанию), NL→SQL без явного source_table в notebook_context всегда использует ds_default_source_table (train).
    # True — подставлять последнюю успешную staging-таблицу из data_import_jobs (может расходиться с «всё из train»).
    ds_implicit_source_use_latest_staging: bool = False
    ds_metric_caps: dict[str, float] = {
        "orders_count": 10_000_000.0,
        "done_rides": 10_000_000.0,
        "cancellations_total": 10_000_000.0,
        "sum_order_price": 1_000_000_000.0,
    }
    llm_provider: str = "deepseek"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    llm_timeout_seconds: int = 45
    llm_temperature: float = 0.1
    llm_max_tokens: int = 1024
    llm_failure_threshold: int = 3
    llm_cooldown_seconds: int = 45

    # Demo auth bypass (dev/demo only): если нет/некорректен Bearer, использовать демо-пользователя.
    demo_auth_bypass_enabled: bool = False
    demo_auth_email: str = "manager@drivee.local"

    # Guardrails / anti-abuse (NL→SQL до LLM и после семантики).
    guardrails_max_prompt_chars: int = 8000
    guardrails_max_prompt_newlines: int = 80
    guardrails_rate_limit_enabled: bool = True
    guardrails_rate_limit_window_seconds: int = 60
    guardrails_max_requests_per_window: int = 40

    # Производительность SQL / выборки
    sql_warn_scan_period_days: int = 90
    sql_hard_scan_period_days: int = 730
    sql_warn_group_by_columns: int = 5
    sql_slow_query_complexity_score: int = 50
    sql_sample_complexity_score_min: int = 55
    sql_sample_max_rows: int = 300
    sql_execution_hard_row_cap: int = 5000
    sql_result_cache_enabled: bool = True
    sql_result_cache_ttl_seconds: int = 60
    sql_result_cache_max_entries: int = 200
    sql_result_cache_max_rowcount: int = 800
    dictionary_api_cache_ttl_seconds: int = 120
    template_quick_run_cache_ttl_seconds: int = 90
    template_quick_run_cache_max_entries: int = 64

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: list[str] | str) -> list[str]:
        def _norm_token(s: str) -> str:
            t = s.strip()
            if len(t) >= 2 and t[0] in "\"'" and t[-1] == t[0]:
                t = t[1:-1].strip()
            return t

        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("[") and raw.endswith("]"):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [_norm_token(str(item)) for item in parsed if _norm_token(str(item))]
                except json.JSONDecodeError:
                    pass
            return [_norm_token(item) for item in raw.split(",") if _norm_token(item)]
        return [_norm_token(str(x)) for x in value if _norm_token(str(x))]

    @field_validator("sql_whitelist_schemas", mode="before")
    @classmethod
    def split_sql_whitelist_schemas(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("[") and raw.endswith("]"):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip().lower() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return [str(x).strip().lower() for x in value if str(x).strip()]

    @field_validator("sql_intents_require_limit", "sql_whitelist_tables", "sql_whitelist_columns", mode="before")
    @classmethod
    def split_list_like_fields(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("[") and raw.endswith("]"):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [item.strip() for item in value.split(",") if item.strip()]
        return [str(x).strip() for x in value if str(x).strip()]

    @field_validator("ds_metric_caps", mode="before")
    @classmethod
    def normalize_ds_metric_caps(cls, value: dict[str, float] | None) -> dict[str, float]:
        if not value:
            return {}
        out: dict[str, float] = {}
        for k, v in value.items():
            try:
                out[str(k).strip()] = float(v)
            except (TypeError, ValueError):
                continue
        return out

    @model_validator(mode="after")
    def hydrate_database_url(self) -> "Settings":
        if self.database_url.strip():
            return self
        self.database_url = (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
        return self

    @model_validator(mode="after")
    def validate_prod_security(self) -> "Settings":
        env = (self.app_env or "").strip().lower()
        if env not in KNOWN_APP_ENVS:
            raise ValueError(
                "APP_ENV должен быть одним из: dev, demo, local, test, ci, prod, production."
            )
        if env in ("prod", "production"):
            if not (self.jwt_secret or "").strip():
                raise ValueError("JWT_SECRET обязателен при APP_ENV=prod")
            if any(str(o).strip() == "*" for o in self.cors_origins):
                raise ValueError("CORS с '*' запрещён при APP_ENV=prod")
            if self.demo_auth_bypass_enabled:
                raise ValueError("DEMO_AUTH_BYPASS_ENABLED запрещён при APP_ENV=prod.")
            if self.mock_mode:
                raise ValueError("MOCK_MODE запрещён при APP_ENV=prod.")
            if self.mock_sql_execution_fallback:
                raise ValueError("MOCK_SQL_EXECUTION_FALLBACK запрещён при APP_ENV=prod.")
        if env == "ci" and self.demo_auth_bypass_enabled:
            raise ValueError("DEMO_AUTH_BYPASS_ENABLED=true в CI запрещён: используйте явный JWT в тестах.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
