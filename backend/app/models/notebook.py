from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.workspace import Workspace


class Notebook(Base, TimestampMixin):
    __tablename__ = "notebooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notebook_status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    context_chain_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    latest_cell_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notebook_cells.id", ondelete="SET NULL"), nullable=True
    )

    workspace: Mapped[Workspace] = relationship("Workspace", back_populates="notebooks")
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")
    cells: Mapped[list[NotebookCell]] = relationship(
        "NotebookCell",
        back_populates="notebook",
        order_by="NotebookCell.position",
        foreign_keys="NotebookCell.notebook_id",
        lazy="selectin",
    )


class NotebookCell(Base, TimestampMixin):
    __tablename__ = "notebook_cells"
    __table_args__ = (UniqueConstraint("notebook_id", "position", name="uq_notebook_cell_position"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notebooks.id", ondelete="CASCADE"), index=True)
    cell_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    interpreted_intent: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    extracted_entities_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    semantic_terms_json: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    execution_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started")
    chart_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    selected_chart_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    insight_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    clarification_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    clarification_question: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    clarification_options_json: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    parent_cell_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notebook_cells.id", ondelete="SET NULL"), nullable=True
    )
    context_snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    trace_payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    forecast_payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    notebook: Mapped[Notebook] = relationship("Notebook", back_populates="cells", foreign_keys=[notebook_id])
    runs: Mapped[list[CellRun]] = relationship("CellRun", back_populates="cell", lazy="selectin", order_by="CellRun.run_number")


class CellRun(Base):
    __tablename__ = "cell_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cell_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notebook_cells.id", ondelete="CASCADE"), index=True)
    notebook_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notebooks.id", ondelete="CASCADE"), index=True)
    run_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    run_status: Mapped[str] = mapped_column(String(32), nullable=False, default="started")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validation_report_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    execution_engine: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="postgresql")
    rows_returned: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    result_schema_json: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    result_preview_json: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    trace_payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    cell: Mapped[NotebookCell] = relationship("NotebookCell", back_populates="runs")

    __table_args__ = (UniqueConstraint("cell_id", "run_number", name="uq_cell_run_number"),)
