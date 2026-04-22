from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.dashboard import Dashboard, DashboardWidget
from app.repositories.base import BaseRepository


class DashboardRepository(BaseRepository):
    def create_dashboard(self, row: Dashboard) -> Dashboard:
        self.session.add(row)
        self.session.flush()
        return row

    def add_widget(self, row: DashboardWidget) -> DashboardWidget:
        self.session.add(row)
        self.session.flush()
        return row

    def get_with_widgets(self, dashboard_id: uuid.UUID) -> Optional[Dashboard]:
        stmt = (
            select(Dashboard)
            .where(Dashboard.id == dashboard_id)
            .options(selectinload(Dashboard.widgets))
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def list_for_workspace(self, workspace_id: uuid.UUID, limit: int = 50) -> list[Dashboard]:
        stmt = (
            select(Dashboard)
            .where(Dashboard.workspace_id == workspace_id)
            .order_by(Dashboard.updated_at.desc())
            .limit(limit)
        )
        return list(self.session.execute(stmt).scalars().all())

    def create_auto_dashboard_with_widgets(
        self,
        *,
        workspace_id: uuid.UUID,
        owner_user_id: uuid.UUID,
        title: str,
        description: Optional[str],
        widgets: list[dict[str, Any]],
        source_history_window_json: dict[str, Any],
    ) -> Dashboard:
        dash = Dashboard(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            title=title,
            description=description,
            layout_json={"grid": "12-col", "auto": True},
            is_auto_generated=True,
            source_history_window_json=source_history_window_json,
        )
        self.session.add(dash)
        self.session.flush()

        for i, w in enumerate(widgets):
            wt, ct = map_api_chart_to_widget_fields(str(w.get("chart_type", "bar")))
            self.session.add(
                DashboardWidget(
                    dashboard_id=dash.id,
                    title=str(w["title"]),
                    widget_type=wt,
                    position_x=0,
                    position_y=i * 3,
                    width=int(w.get("width", 6)),
                    height=int(w.get("height", 3)),
                    metric_key=w.get("metric_key"),
                    chart_type=ct,
                    source_type="template",
                    config_json=dict(w.get("config_json") or {}),
                )
            )
        self.session.flush()
        return dash


def map_api_chart_to_widget_fields(api_chart_type: str) -> tuple[str, str]:
    """Map public API chart hint to (dashboard_widgets.widget_type, chart_subtype)."""
    key = api_chart_type.strip().lower().replace(" ", "_")
    mapping: dict[str, tuple[str, str]] = {
        "line": ("line_chart", "line"),
        "area": ("line_chart", "area"),
        "bar": ("bar_chart", "vertical"),
        "column": ("bar_chart", "vertical"),
        "horizontal_bar": ("bar_chart", "horizontal"),
        "pie": ("pie_chart", "pie"),
        "donut": ("pie_chart", "donut"),
        "table": ("table", "table"),
        "map": ("map", "choropleth"),
        "kpi": ("kpi", "scalar"),
        "forecast": ("forecast", "line"),
    }
    return mapping.get(key, ("bar_chart", key or "vertical"))
