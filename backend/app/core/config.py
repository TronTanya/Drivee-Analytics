from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Drivee Analytics Notebook API"
    app_env: str = "dev"
    app_version: str = "0.1.0"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    cors_origins: list[str] = ["http://localhost:3000"]

    jwt_secret: str = "drivee-dev-secret"
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

    mock_mode: bool = True
    sql_default_limit: int = 1000
    sql_timeout_seconds: int = 8
    sql_whitelist_tables: list[str] = [
        "anonymized_incity_orders",
    ]
    sql_whitelist_columns: list[str] = [
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
    ]

    csv_upload_dir: str = "var/csv_uploads"
    csv_max_upload_mb: int = 50
    csv_staging_schema: str = "user_staging"
    csv_inference_max_rows: int = 100_000
    ds_default_source_table: str = "public.anonymized_incity_orders"
    city_id_label_map: dict[str, str] = {
        "67": "Алматы",
    }

    llm_provider: str = "deepseek"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    llm_timeout_seconds: int = 12
    llm_temperature: float = 0.1
    llm_max_tokens: int = 500
    llm_failure_threshold: int = 3
    llm_cooldown_seconds: int = 45

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("city_id_label_map", mode="before")
    @classmethod
    def normalize_city_id_label_map(cls, value: dict[str, str] | None) -> dict[str, str]:
        if not value:
            return {}
        return {str(k).strip(): str(v).strip() for k, v in value.items() if str(k).strip() and str(v).strip()}

    @model_validator(mode="after")
    def hydrate_database_url(self) -> "Settings":
        if self.database_url.strip():
            return self
        self.database_url = (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
