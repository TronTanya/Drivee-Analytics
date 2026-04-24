__all__ = ["AuthService"]


def __getattr__(name: str):
    if name == "AuthService":
        from app.services.auth_service import AuthService

        return AuthService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
