"""Smart visualization recommendation payload (post-SQL)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class GeoVisualizationMetadata(BaseModel):
    geo_enabled: bool = False
    geo_dimension: Optional[str] = None
    map_scope: Optional[str] = None
    fallback_chart_type: Optional[str] = None


class VisualizationRecommendation(BaseModel):
    recommended_chart_type: str
    alternative_chart_types: list[str] = Field(default_factory=list)
    visualization_explanation: str = ""
    visualization_confidence: float = Field(ge=0.0, le=1.0, default=0.85)
    geo_metadata: Optional[GeoVisualizationMetadata] = None

    # Backward compatibility for older code paths / payloads.
    recommendation_reason: str = ""
