"""`BotEventDispatcher` -- dispara las reacciones de los bots simuladores a partir de
eventos de dominio ya publicados por Redis Pub/Sub. Implementa el mismo contrato
estructural (`dispatch(raw_payload)`) que `app/realtime/dispatcher.py::EventDispatcher`
y `app/modules/chat/realtime.py::ChatSystemEventDispatcher`, para un 5º consumidor
independiente (`app/main.py`) -- `app/modules/remates/`/`app/modules/ofertas/` no saben
que este módulo existe, mismo principio que ya aplica todo el proyecto.

Whitelist explícita de eventos relevantes (`_RELEVANT_EVENTS`), mismo criterio que
`EVENT_REGISTRY`/`SYSTEM_MESSAGE_BUILDERS`: un evento de dominio nuevo no dispara
reacciones de bots hasta que alguien lo agregue acá a propósito.
"""

import json
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.bots.models import BotSimulationRun, BotSimulationStatus
from app.modules.bots.runner import BotRunnerRegistry

logger = structlog.get_logger(__name__)

_STOPPING_EVENTS = {"remate.finished", "remate.cancelled"}
_RELEVANT_EVENTS = {
    "lote.opened",
    "lote.closed",
    "lote.cancelled",
    "remate.paused",
    "remate.resumed",
    "oferta.accepted",
    *_STOPPING_EVENTS,
}


class BotEventDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        runner_registry: BotRunnerRegistry,
    ) -> None:
        self._session_factory = session_factory
        self._runner_registry = runner_registry

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`/
        `ChatSystemEventDispatcher.dispatch`: un evento roto o una falla puntual no
        debe tirar abajo la suscripción entera."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("bot_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict):
            return

        event_type = envelope.get("event_type")
        if event_type not in _RELEVANT_EVENTS:
            return

        remate_id_raw = envelope.get("remate_id")
        if not remate_id_raw:
            return
        try:
            remate_id = uuid.UUID(remate_id_raw)
        except (ValueError, TypeError):
            return

        try:
            await self._handle(event_type, remate_id, envelope)
        except Exception:
            logger.exception("bot_event_dispatch_failed", event_type=event_type)

    async def _handle(self, event_type: str, remate_id: uuid.UUID, envelope: dict) -> None:
        if event_type == "lote.opened":
            await self._handle_lote_opened(remate_id, envelope)
        elif event_type in ("lote.closed", "lote.cancelled"):
            await self._handle_lote_closed(remate_id, envelope)
        elif event_type == "remate.paused":
            await self._runner_registry.pause(remate_id)
        elif event_type == "remate.resumed":
            await self._runner_registry.resume(remate_id)
        elif event_type == "oferta.accepted":
            await self._handle_oferta_accepted(remate_id, envelope)
        elif event_type in _STOPPING_EVENTS:
            await self._handle_simulation_stop(remate_id, reason=event_type.replace(".", "_"))

    async def _handle_lote_opened(self, remate_id: uuid.UUID, envelope: dict) -> None:
        lote_id_raw = envelope.get("lote_id")
        if not lote_id_raw:
            return
        await self._runner_registry.notify_lote_opened(remate_id, uuid.UUID(lote_id_raw))

    async def _handle_lote_closed(self, remate_id: uuid.UUID, envelope: dict) -> None:
        lote_id_raw = envelope.get("lote_id")
        if not lote_id_raw:
            return
        await self._runner_registry.notify_lote_closed(remate_id, uuid.UUID(lote_id_raw))

    async def _handle_oferta_accepted(self, remate_id: uuid.UUID, envelope: dict) -> None:
        lote_id_raw = envelope.get("lote_id")
        buyer_id_raw = envelope.get("buyer_id")
        if not lote_id_raw or not buyer_id_raw:
            return
        await self._runner_registry.notify_offer_accepted(
            remate_id, uuid.UUID(lote_id_raw), uuid.UUID(buyer_id_raw)
        )

    async def _handle_simulation_stop(self, remate_id: uuid.UUID, *, reason: str) -> None:
        """El remate terminó/se canceló -- cancela toda tarea en memoria Y persiste
        `stopped` para que la fila de `bot_simulation_runs` nunca quede `running`/
        `paused` en un remate que ya no puede recibir ofertas."""
        await self._runner_registry.stop(remate_id)
        async with self._session_factory() as db:
            stmt = (
                select(BotSimulationRun)
                .where(BotSimulationRun.remate_id == remate_id)
                .with_for_update()
            )
            run = (await db.execute(stmt)).scalar_one_or_none()
            if run is None or run.status == BotSimulationStatus.STOPPED:
                return
            run.status = BotSimulationStatus.STOPPED
            run.stopped_at = datetime.now(UTC)
            run.stop_reason = reason
            await db.commit()
