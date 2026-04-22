from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import UnauthorizedException

# Keep bcrypt verification support for legacy rows, but use pbkdf2 by default.
# This avoids runtime issues with incompatible bcrypt/passlib builds.
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _refresh_secret() -> str:
    return settings.jwt_refresh_secret or settings.jwt_secret


def create_access_token(*, user_id: UUID, role_key: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_exp_minutes)
    payload = {
        "sub": str(user_id),
        "typ": "access",
        "role": role_key,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(*, user_id: UUID) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_exp_days)
    payload = {
        "sub": str(user_id),
        "typ": "refresh",
        "exp": expires_at,
    }
    return jwt.encode(payload, _refresh_secret(), algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise UnauthorizedException("Invalid or expired access token") from exc
    if payload.get("typ") != "access":
        raise UnauthorizedException("Invalid token type")
    return payload


def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _refresh_secret(), algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise UnauthorizedException("Invalid or expired refresh token") from exc
    if payload.get("typ") != "refresh":
        raise UnauthorizedException("Invalid token type")
    return payload
