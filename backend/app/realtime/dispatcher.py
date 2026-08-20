"""Dispatcher de eventos de dominio hacia salas (Épica 3, Módulo 3.5). Ver
docs/22-sincronizacion-tiempo-real.md y ADR-025.

`EventDispatcher` es el punto exacto donde se cruzan el Event Bus (Módulo 3.2) y el
Gateway WebSocket + salas (Módulos 3.3/3.4): recibe el JSON crudo publicado en un canal
`events.<remate_id>`, lo interpreta como uno de los eventos de `registry.py`, resuelve
qué sala le corresponde (`remate_id`, ya viene en el propio evento — no hace falta
derivarlo del nombre del canal), y lo entrega únicamente a las conexiones de esa sala.

## Enmascarado por destinatario (Fase 1 de remediación del WebSocket Security Audit)

Algunos eventos (`app/realtime/privilege.py::PROTECTED_EVENT_TYPES`) llevan campos que
tienen control de acceso en su endpoint HTTP equivalente (`buyer_id`, `reserve_price`) o
que no deben publicarse fuera del dueño del remate en absoluto (los `PRIVILEGED_ONLY_EVENTS`
de moderación). Para esos tipos de evento -- y **solo** para esos, el resto de
`SYNCED_EVENTS` sigue sin tocar la base de datos, igual que antes de esta remediación --
`dispatch()` resuelve una única vez, por evento, qué conexiones de la sala son
privilegiadas (`RealtimePrivilegeResolver`, una consulta de `Remate` + una consulta
batch de `User.role`) y arma el payload **dentro del loop de envío, por conexión**, no
una sola vez antes del loop: dos destinatarios de la misma sala pueden tener privilegios
distintos (el dueño del remate sí ve `buyer_id`, un comprador cualquiera no), así que no
puede existir un único payload "correcto" para toda la sala en esos casos.

`session_factory` es opcional (`None` por default) únicamente para no romper los tests
unitarios existentes de este módulo, que ejercitan el scoping por sala con un
`ConnectionManager`/`RoomManager` en memoria y sin base de datos real (ver
`tests/test_realtime_dispatcher.py`). En producción, `app/main.py` siempre pasa uno real
-- sin él, cualquier evento protegido se resuelve fail-closed (sin privilegio para
nadie), nunca se cae al comportamiento viejo de mandar el payload completo sin enmascarar.
"""

import json
from typing import Any

import structlog
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.realtime.messages import DomainEventMessage
from app.realtime.privilege import (
    MASKERS,
    PRIVILEGED_ONLY_EVENTS,
    PROTECTED_EVENT_TYPES,
    RealtimePrivilegeResolver,
    RecipientContext,
    mask_payload_for_recipient,
)
from app.realtime.registry import EVENT_REGISTRY
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager

logger = structlog.get_logger(__name__)

# Contexto fail-closed reutilizado para cualquier destinatario del que no se pudo (o no
# hizo falta) resolver privilegio real -- nunca se asume privilegiado por default.
_UNPRIVILEGED_DEFAULT = RecipientContext


class EventDispatcher:
    def __init__(
        self,
        connection_manager: ConnectionManager,
        room_manager: RoomManager,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        self._connection_manager = connection_manager
        self._room_manager = room_manager
        self._session_factory = session_factory

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Punto de entrada único, llamado por `EventConsumer` por cada mensaje que
        llega de Redis Pub/Sub. Nunca lanza: cualquier fallo (JSON inválido, tipo no
        registrado, payload que no matchea el schema, un socket que ya se cerró, o un
        fallo al resolver privilegio) se registra y se descarta/trata fail-closed -- un
        evento roto o una entrega fallida no debe tirar abajo el consumo del resto."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("realtime_event_invalid_json", raw_payload=raw_payload)
            return

        event_type = envelope.get("event_type") if isinstance(envelope, dict) else None
        event_cls = EVENT_REGISTRY.get(event_type) if event_type else None
        if event_cls is None:
            logger.debug("realtime_event_ignored_unregistered_type", event_type=event_type)
            return

        try:
            event = event_cls.model_validate(envelope)
        except ValidationError:
            logger.warning("realtime_event_invalid_payload", event_type=event_type)
            return

        connection_ids = self._room_manager.connections_in_room(event.remate_id)
        if not connection_ids:
            logger.debug(
                "realtime_event_no_subscribers",
                event_type=event.event_type,
                remate_id=str(event.remate_id),
            )
            return

        base_payload = event.model_dump(mode="json")
        recipients = await self._resolve_recipients(event.event_type, event.remate_id, connection_ids)

        delivered = 0
        for connection_id in connection_ids:
            context = self._connection_manager.get(connection_id)
            if context is None:
                # Se desconectó entre que RoomManager armó la lista y este envío --
                # router.py ya se está encargando de darla de baja en su propio finally.
                continue

            payload = self._payload_for_recipient(
                event.event_type, base_payload, recipients, context.user_id
            )
            if payload is None:
                # Evento privilegiado-only (ver PRIVILEGED_ONLY_EVENTS) y este
                # destinatario puntual no tiene privilegio -- no se le entrega nada.
                continue

            message = DomainEventMessage(
                event_type=event.event_type,
                remate_id=event.remate_id,
                occurred_at=event.occurred_at,
                payload=payload,
            ).model_dump_json()
            try:
                await context.websocket.send_text(message)
                delivered += 1
            except Exception:
                logger.warning(
                    "realtime_event_delivery_failed",
                    connection_id=str(connection_id),
                    event_type=event.event_type,
                )

        logger.info(
            "realtime_event_dispatched",
            event_type=event.event_type,
            remate_id=str(event.remate_id),
            room_connections=len(connection_ids),
            delivered=delivered,
        )

    async def _resolve_recipients(
        self, event_type: str, remate_id, connection_ids
    ) -> dict:
        """Solo consulta la base para los tipos de evento que de verdad tienen algo que
        proteger (`PROTECTED_EVENT_TYPES`) -- el resto de `SYNCED_EVENTS` no paga
        ningún costo extra por esta remediación. Sin `session_factory` configurado
        (tests unitarios de este módulo, ver docstring de la clase) devuelve un mapa
        vacío -- `_payload_for_recipient` interpreta eso como "sin privilegio" para
        cualquiera, nunca como "sin restricción"."""
        if event_type not in PROTECTED_EVENT_TYPES or self._session_factory is None:
            return {}

        user_ids = set()
        for connection_id in connection_ids:
            context = self._connection_manager.get(connection_id)
            if context is not None:
                user_ids.add(context.user_id)
        if not user_ids:
            return {}

        try:
            async with self._session_factory() as db:
                return await RealtimePrivilegeResolver(db).resolve(remate_id, user_ids)
        except Exception:
            # Fail closed: un fallo resolviendo privilegio (Postgres caído, etc.) nunca
            # debe traducirse en "mandalo sin enmascarar" -- se trata como si nadie
            # fuera privilegiado (ver _payload_for_recipient).
            logger.warning("realtime_privilege_resolution_failed", event_type=event_type)
            return {}

    @staticmethod
    def _payload_for_recipient(
        event_type: str,
        base_payload: dict[str, Any],
        recipients: dict,
        user_id,
    ) -> dict[str, Any] | None:
        """`None` significa "este destinatario puntual no recibe nada de este evento"
        (solo aplica a `PRIVILEGED_ONLY_EVENTS`) -- distinto de un `dict` con campos en
        `None` (evento sí se entrega, pero con el campo sensible oculto)."""
        if event_type in PRIVILEGED_ONLY_EVENTS:
            recipient = recipients.get(user_id)
            if recipient is None or not recipient.is_privileged:
                return None
            return base_payload

        if event_type in MASKERS:
            recipient = recipients.get(
                user_id, _UNPRIVILEGED_DEFAULT(viewer_id=user_id, is_privileged=False)
            )
            return mask_payload_for_recipient(event_type, base_payload, recipient)

        return base_payload
