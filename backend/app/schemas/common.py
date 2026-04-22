from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    error: str = Field(..., description="Application error code")
    message: str
    details: dict = Field(default_factory=dict)
