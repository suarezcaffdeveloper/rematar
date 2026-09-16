"""`GarantiaEventDispatcher` -- reacciona a `postauction.case_created` (el comprador ganó
un lote) capturando su garantía activa, y a `remate.finished`/`remate.cancelled`
liberando cualquier garantía que haya quedado `ACTIVE` sin ganador. Ver el plan "Garantía
económica (bloqueo de tarjeta) para ofertar en un remate", sección "Cierre del remate".

Mismo contrato estructural que `app/postauction/realtime.py::PostAuctionEventDispatcher`
(`dispatch(raw_payload)`), consumidor **independiente** (otra instancia de
`EventConsumer`, cableada en `app/main.py`) -- no importa `app.postauction` ni
`app.modules.ofertas` en absoluto: lee el JSON crudo de `postauction.case_created` (que
ya trae `remate_id`/`buyer_id`, ver `app/postauction/events.py`) sin importar esa clase
de evento, exactamente el mismo criterio que `PostAuctionEventDispatcher` aplica sobre
`lote.winner_determined`. Esto mantiene la dirección de dependencia de un solo sentido
`ofertas -> garantias` (el gate, Fase 4) sin agregar `garantias -> postauction` de
vuelta -- lo contrario cerraría un ciclo de tres módulos (`ofertas -> garantias ->
postauction -> ofertas`, este último ya existente) que ningún otro par de módulos del
proyecto tiene (ver `tests/test_architecture_boundaries.py`).

Por qué reaccionar a `postauction.case_created` en vez de recién resolver todo al
`remate.finished`: captura el monto apenas se sabe que el comprador ganó, sin esperar a
que cierren el resto de los lotes del remate (mejor UX -- el comprador ve la garantía
`captured` de inmediato, no recién al final) y sin tener que reconsultar quién ganó qué
en un segundo paso. `remate.finished`/`remate.cancelled` solo necesitan resolver lo que
quedó *sin* ganador: cualquier `Garantia` todavía `ACTIVE` de ese remate en ese momento
nunca tuvo un `postauction.case_created` asociado.

Construye sus propias dependencias por mensaje (una sesión nueva por evento, no
`Depends()`) -- mismo motivo que `PostAuctionEventDispatcher`/`ChatSystemEventDispatcher`:
corre como tarea de fondo, y el `session_factory` se recibe por constructor para que los
tests puedan inyectar el suyo propio. El `MercadoPagoClient` también se recibe ya
construido (`app/main.py` lo arma una única vez con `build_mercadopago_client`, mismo
criterio que `NotificationService`/`build_notification_service` en
`PostAuctionEventDispatcher`) -- así un test puede pasar un fake sin tocar `Settings`."""

import json
import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.modules.garantias.mercadopago_client import MercadoPagoClient
from app.modules.garantias.models import GarantiaStatus
from app.modules.garantias.repository import GarantiaRepository
from app.modules.garantias.service import GarantiaService
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService

logger = structlog.get_logger(__name__)

# Whitelist explícita -- mismo criterio que `_RECOGNIZED_EVENT_TYPES`
# (`app/postauction/realtime.py`) y `SYSTEM_MESSAGE_BUILDERS` (`app/modules/chat/realtime.py`).
_RECOGNIZED_EVENT_TYPES = frozenset(
    {"postauction.case_created", "remate.finished", "remate.cancelled"}
)

_RELEASE_REASONS = {
    "remate.finished": "no_ganador",
    "remate.cancelled": "remate_cancelado",
}


class GarantiaEventDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
        mp_client: MercadoPagoClient,
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._mp_client = mp_client
        self._settings = settings

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`: un evento roto o
        una falla puntual (ej. Mercado Pago caído) no debe tirar abajo la suscripción; un
        scheduler de reconciliación de respaldo (Fase 6) reintenta lo que quede
        `ACTIVE` sobre un remate ya resuelto."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("garantia_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict):
            return

        event_type = envelope.get("event_type")
        if event_type not in _RECOGNIZED_EVENT_TYPES:
            # Incluye, a propósito, los propios `garantia.*` que este módulo podría
            # publicar en el futuro (sin esto habría un loop) y cualquier otro evento.
            return

        try:
            remate_id = uuid.UUID(envelope["remate_id"])
        except (KeyError, ValueError, TypeError):
            logger.warning("garantia_event_malformed_payload", event_type=event_type)
            return

        try:
            async with self._session_factory() as db:
                garantia_repository = GarantiaRepository(db)

                if event_type == "postauction.case_created":
                    try:
                        buyer_id = uuid.UUID(envelope["buyer_id"])
                    except (KeyError, ValueError, TypeError):
                        logger.warning(
                            "garantia_event_malformed_payload", event_type=event_type
                        )
                        return
                    garantia = await garantia_repository.get_by_remate_and_buyer(
                        remate_id, buyer_id
                    )
                    if garantia is None or garantia.status != GarantiaStatus.ACTIVE:
                        return  # sin garantía activa -- este remate no la exigía, o ya se resolvió.

                    garantia_service = self._build_service(db)
                    await garantia_service.capture(garantia)
                    logger.info(
                        "garantia_captured_on_win",
                        garantia_id=str(garantia.id),
                        remate_id=str(remate_id),
                    )
                    return

                # remate.finished / remate.cancelled: libera todo lo que siga ACTIVE --
                # nunca tuvo un `postauction.case_created` asociado.
                active = await garantia_repository.list_active_by_remate(remate_id)
                if not active:
                    return
                garantia_service = self._build_service(db)
                reason = _RELEASE_REASONS[event_type]
                for garantia in active:
                    await garantia_service.release(garantia, reason=reason)
                    logger.info(
                        "garantia_released_on_remate_close",
                        garantia_id=str(garantia.id),
                        remate_id=str(remate_id),
                        reason=reason,
                    )
        except Exception:
            logger.exception("garantia_event_dispatch_failed", event_type=event_type)

    def _build_service(self, db: AsyncSession) -> GarantiaService:
        remate_service = RemateService(
            RemateRepository(db), LoteRepository(db), self._event_bus, AuditLogRepository(db)
        )
        return GarantiaService(
            GarantiaRepository(db), remate_service, self._mp_client, self._settings
        )
