"""Catálogo de eventos de dominio del módulo de autenticación (Fase 3 de remediación
del WebSocket Security Audit — invalidación de conexiones WebSocket).

`SessionInvalidated` es el único evento de este módulo: representa, de forma genérica,
cualquier motivo por el que una sesión (o todas las sesiones de un usuario) dejan de
ser válidas. Se investigó primero si ya existía un evento apropiado (`AuditAction` no
cuenta: es para el registro de auditoría persistido, no para Pub/Sub en tiempo real) y
si convenía un evento por caso (`LoggedOut`/`PasswordChanged`/`UserSuspended`/...) --
se descartó: los tres casos reales que hoy invalidan sesiones en RematAR (logout,
cambio de contraseña, suspensión de cuenta) requieren exactamente la misma reacción del
lado del consumidor (cerrar la conexión WS correspondiente, ver
`app/modules/auth/realtime.py::SessionInvalidationDispatcher`) — separarlos en eventos
distintos no ganaría nada, solo obligaría al dispatcher a repetir la misma lógica tres
veces. `reason` alcanza para que el log del dispatcher distinga el motivo sin necesitar
tres canales/eventos distintos.

No es un `RemateScopedEvent` (`app/events/base.py`): esto no está scoped a un remate,
scopea a un usuario/sesión. Canal fijo, único para toda la app (no un canal por
usuario) porque cualquier instancia del backend puede tener la conexión WS del usuario
afectado — el mismo criterio que ya usa `events.*` para remates, adaptado a que acá no
hace falta filtrar por publicador, cada instancia se suscribe una única vez a este único
canal (ver `app/modules/auth/realtime.py`).
"""

import uuid
from typing import Literal

from app.events.base import DomainEvent

SESSION_INVALIDATED_TOPIC = "auth.session_invalidated"


class SessionInvalidated(DomainEvent):
    event_type: Literal["auth.session_invalidated"] = "auth.session_invalidated"
    user_id: uuid.UUID
    # `None` = todas las sesiones/conexiones de este usuario (revoke-all: cambio de
    # contraseña, suspensión). Un `UUID` puntual = una única sesión (logout de una
    # sesión específica, `RefreshToken.id` — ver `AuthService.logout`).
    session_id: uuid.UUID | None
    reason: Literal["logout", "password_changed", "user_suspended"]

    @property
    def topic(self) -> str:
        return SESSION_INVALIDATED_TOPIC
