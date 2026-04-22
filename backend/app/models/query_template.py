from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.role import Role
    from app.models.user import User
    from app.models.workspace import Workspace


class QueryTemplate(Base, TimestampMixin):
    __tablename__ = "query_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    template_key: Mapped[str] = mapped_column(Text, nullable=False)
    template_name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nl_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    sql_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_chart_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_params_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    semantic_hints_json: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="query_templates", lazy="selectin")
    target_role: Mapped[Optional["Role"]] = relationship("Role", lazy="selectin")
    author: Mapped[Optional["User"]] = relationship("User", lazy="selectin")
