"""Token firmado del botón "Contactar al rematador" (`GET /r/wa/{token}`, ver
`app/whatsapp/redirect_router.py`).

Reutiliza la infraestructura de JWT genérica de `app/core/security.py`
(`encode_token`/`decode_token`, la misma que usa `app/modules/auth/security.py` para
los tokens de sesión) en vez de inventar un secreto de firma propio. El claim `type`
(mismo patrón que `TokenType` en `auth/security.py`) evita que un token de sesión
robado pueda usarse acá, o viceversa.

El token lleva adentro, ya resuelto y firmado en el momento del envío (cuando
`WhatsAppNotificationChannel` tiene el `LoteAdjudicadoContext` completo), el teléfono
normalizado del rematador y los datos del mensaje. Por diseño, el endpoint de
redirección nunca consulta la base de datos: solo verifica firma y vencimiento y
redirige a un destino que ya estaba sellado al generarse, así que no hay ningún
parámetro de la request que pueda elegir a dónde redirigir (no es un open redirect).
"""

import uuid
from datetime import timedelta
from enum import StrEnum
from typing import Any

import jwt

from app.core.config import Settings
from app.core.security import decode_token, encode_token


class _TokenType(StrEnum):
    WHATSAPP_REDIRECT = "whatsapp_redirect"


class WhatsAppRedirectTokenInvalidError(Exception):
    """El token del botón es inválido, está malformado, venció, o no es de este tipo."""


def build_redirect_token(
    *,
    case_id: uuid.UUID,
    rematador_phone: str,
    lot_number: str,
    settings: Settings,
) -> str:
    return encode_token(
        {
            "type": _TokenType.WHATSAPP_REDIRECT.value,
            # `case_id` es solo para trazabilidad en logs -- el endpoint no lo usa
            # para buscar nada en la base.
            "case_id": str(case_id),
            "phone": rematador_phone,
            "lot_number": lot_number,
        },
        secret_key=settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        expires_delta=timedelta(days=settings.WHATSAPP_REDIRECT_TOKEN_TTL_DAYS),
    )


def resolve_redirect_token(token: str, settings: Settings) -> dict[str, Any]:
    """Levanta `WhatsAppRedirectTokenInvalidError` si el token es inválido, venció, o
    no es un token de este tipo (ej. alguien pasó un access token de sesión acá)."""
    try:
        payload = decode_token(
            token, secret_key=settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
    except jwt.InvalidTokenError as exc:
        raise WhatsAppRedirectTokenInvalidError("Token inválido o expirado.") from exc

    if payload.get("type") != _TokenType.WHATSAPP_REDIRECT.value:
        raise WhatsAppRedirectTokenInvalidError("Tipo de token inesperado.")

    return payload
