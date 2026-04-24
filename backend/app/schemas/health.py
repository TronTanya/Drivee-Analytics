from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
    database: str = "unknown"
    # ИИ (DeepSeek и др.): настроен ли провайдер; сам вызов API здесь не делается.
    llm_provider: str = ""
    llm_configured: bool = False


class RuntimeHealthResponse(BaseModel):
    environment: str
    debug: bool
    demo_auth_bypass_enabled: bool
    mock_mode: bool
    mock_sql_execution_fallback: bool
    postgres_required: bool
    jwt_required: bool
    llm_provider: str
    llm_configured: bool
