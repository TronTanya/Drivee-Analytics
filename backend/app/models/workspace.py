from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.dashboard import Dashboard
    from app.models.data_pipeline import UploadedFile
    from app.models.notebook import Notebook
    from app.models.query_correction import QueryCorrection
    from app.models.query_template import QueryTemplate
    from app.models.saved_report import SavedReport


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    settings_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    notebooks: Mapped[list["Notebook"]] = relationship("Notebook", back_populates="workspace", lazy="selectin")
    query_corrections: Mapped[list["QueryCorrection"]] = relationship(
        "QueryCorrection", back_populates="workspace", lazy="selectin"
    )
    dashboards: Mapped[list["Dashboard"]] = relationship("Dashboard", back_populates="workspace", lazy="selectin")
    saved_reports: Mapped[list["SavedReport"]] = relationship("SavedReport", back_populates="workspace", lazy="selectin")
    query_templates: Mapped[list["QueryTemplate"]] = relationship(
        "QueryTemplate", back_populates="workspace", lazy="selectin"
    )
    uploaded_files: Mapped[list["UploadedFile"]] = relationship(
        "UploadedFile", back_populates="workspace", lazy="selectin"
    )


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    is_default_workspace: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
