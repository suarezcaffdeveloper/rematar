"""Dispatcher de eventos de dominio hacia salas (Épica 3, Módulo 3.5). Ver
docs/22-sincronizacion-tiempo-real.md y ADR-025.

`EventDispatcher` es el punto exacto donde se cruzan el Event Bus (Módulo 3.2) y el
Gateway WebSocket + salas (Módulos 3.3/3.4): recibe el JSON crudo publicado en un canal
`events.<remate_id>`, lo interpreta como uno de los eventos de `registry.py`, resuelve
qué sala le corresponde (`remate_id`, ya viene en el propio evento — no hace falta
derivarlo del nombre del canal), y lo entrega únicamente a las conexiones de esa sala.
No importa nada de `app/modules/*/service.py` ni `engine.py` — solo las clases de
evento (Pydantic, sin lógica de negocio) y los dos managers del Gateway.
"""

import json

import structlog
from pydantic import ValidationError

from app.realtime.messages import DomainEventMessage
from app.realtime.registry import EVENT_REGISTRY
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager

logger = structlog.get_logger(__name__)


class EventDispatcher:
    def __init__(self, connection_manager: ConnectionManager, room_manager: RoomManager) -> None:
        self._connection_manager = connection_manager
        self._room_manager = room_manager

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Punto de entrada único, llamado por `EventConsumer` por cada mensaje que
        llega de Redis Pub/Sub. Nunca lanza: cualquier fallo (JSON inválido, tipo no
        registrado, payload que no matchea el schema, un socket que ya se cerró) se
        registra y se descarta — un evento roto o una entrega fallida no debe tirar
        abajo el consumo del resto."""
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

        message = DomainEventMessage(
            event_type=event.event_type,
            remate_id=event.remate_id,
            occurred_at=event.occurred_at,
            payload=event.model_dump(mode="json"),
        ).model_dump_json()

        delivered = 0
        for connection_id in connection_ids:
            context = self._connection_manager.get(connection_id)
            if context is None:
                # Se desconectó entre que RoomManager armó la lista y este envío --
                # router.py ya se está encargando de darla de baja en su propio finally.
                continue
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
