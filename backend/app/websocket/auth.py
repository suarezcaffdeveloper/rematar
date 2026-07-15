"""Autenticación de conexión (Épica 3, Módulo 3.3) — implementa por primera vez el
flujo que ADR-006 (Fase 0) ya había decidido: sin credenciales en la URL, autenticación
en el primer mensaje. Ver docs/20-gateway-websocket.md.

Reutiliza `AuthService.get_current_user_from_access_token` sin ningún cambio — el
Gateway es un segundo transporte para la misma identidad ya validada por HTTP
(`app/modules/auth/dependencies.py`, `get_current_user`), no un esquema de
autenticación paralelo.
"""

import asyncio

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.exceptions import UnauthorizedError
from app.modules.auth.service import AuthService
from app.modules.users.models import User
from app.websocket import close_codes
from app.websocket.messages import AuthMessage
from app.websocket.utils import safe_close

logger = structlog.get_logger(__name__)


async def authenticate_connection(
    websocket: WebSocket, auth_service: AuthService, *, timeout_seconds: float
) -> User | None:
    """Espera el primer mensaje con un timeout, lo valida como `AuthMessage`, y
    resuelve el usuario. Devuelve `None` (habiendo cerrado la conexión con el código
    correspondiente) si cualquier paso falla — nunca lanza."""
    try:
        raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=timeout_seconds)
    except TimeoutError:
        await safe_close(
            websocket, code=close_codes.AUTH_TIMEOUT, reason="Tiempo de autenticación agotado."
        )
        return None
    except WebSocketDisconnect:
        # El cliente ya se fue: no hay nada que cerrar ni loguear como fallo de auth.
        return None

    try:
        message = AuthMessage.model_validate_json(raw_message)
    except ValidationError:
        await safe_close(
            websocket,
            code=close_codes.INVALID_MESSAGE,
            reason="Se esperaba {'type': 'auth', 'token': '...'} como primer mensaje.",
        )
        return None

    try:
        user = await auth_service.get_current_user_from_access_token(message.token)
    except UnauthorizedError as exc:
        await safe_close(websocket, code=close_codes.UNAUTHORIZED, reason=exc.message)
        return None

    logger.info("ws_authenticated", user_id=str(user.id))
    return user
