"""Глобальные доп. правила SQL (whitelist таблиц/колонок, лимит строк) — редактирует admin."""

from __future__ import annotations

from sqlalchemy import Integer, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSqlPolicy(Base):
    """Одна строка id=1: расширения к env-настройкам `sql_whitelist_*` и sql_default_limit."""

    __tablename__ = "platform_sql_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    extra_whitelist_tables: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    extra_whitelist_columns: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    nl_max_result_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
