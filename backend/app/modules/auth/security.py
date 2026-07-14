"""Construcción y validación de los JWT concretos que emite RematAR.

Separado de `app/core/security.py` (que solo codifica/decodifica diccionarios genéricos)
porque acá sí importa el dominio: qué claims lleva un access token vs. un refresh token,
cuánto dura cada uno, y cómo se distingue uno de otro (claim `type`) para que un refresh
token robado no pueda usarse como si fuera un access token contra un endpoint protegido.
"""

import uuid
from datetime import timedelta
from enum import StrEnum
from typing import Any

import jwt

from app.core.config import Settings
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token, encode_token
from app.modules.users.models import UserRole


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def create_access_token(*, user_id: uuid.UUID, role: UserRole, settings: Settings) -> str:
    return encode_token(
        {"sub": str(user_id), "role": role.value, "type": TokenType.ACCESS.value},
        secret_key=settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(*, user_id: uuid.UUID, jti: uuid.UUID, settings: Settings) -> str:
    return encode_token(
        {"sub": str(user_id), "jti": str(jti), "type": TokenType.REFRESH.value},
        secret_key=settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_and_validate(
    token: str, *, expected_type: TokenType, settings: Settings
) -> dict[str, Any]:
    """Decodifica un JWT y valida que sea del tipo esperado.

    Centraliza la traducción de cualquier error de JWT (firma inválida, expirado,
    malformado) a `UnauthorizedError`, para que el resto del código nunca importe ni
    atrape excepciones de la librería `jwt` directamente.
    """
    try:
        payload = decode_token(
            token, secret_key=settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Token inválido o expirado.") from exc

    if payload.get("type") != expected_type.value:
        raise UnauthorizedError("Tipo de token inesperado.")

    return payload
