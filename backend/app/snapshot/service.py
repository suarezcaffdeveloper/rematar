"""Snapshot Service (Épica 3, Módulo 3.6). Ver docs/23-snapshot-service.md y ADR-026.

`SnapshotService.build` es el único método público: dado un `remate_id` y quién lo pide
(`viewer`), reconstruye el estado completo del remate combinando lo persistido
(PostgreSQL, vía `RemateService`/`OfertaRepository`, sin modificarlos) con, cuando
corresponde, una caché corta en Redis del recorte más costoso de recalcular (ver sección
de cache más abajo). No importa nada de `app/websocket/` ni `app/realtime/` — recibe
`connected_users` como un `int` simple, no como un `RoomManager`, para no acoplarse a
cómo cada transporte lleva la cuenta de conexiones (ver ADR-026, sección C).
"""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.bots.lookup import BotIdentityResolver
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.schemas import LoteRead
from app.modules.remates.models import Remate
from app.modules.remates.schemas import RemateRead
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.presence.schemas import ConnectedUserSummary
from app.redis.cache import RedisCache
from app.snapshot.schemas import OfertaSnapshotEntry, RawRemateState, RemateStateSnapshot

logger = structlog.get_logger(__name__)

DEFAULT_RECENT_OFFERS_LIMIT = 10
DEFAULT_CACHE_TTL_SECONDS = 2.0


class SnapshotService:
    def __init__(
        self,
        db: AsyncSession,
        remate_service: RemateService,
        oferta_repository: OfertaRepository,
        *,
        cache: RedisCache | None = None,
        recent_offers_limit: int = DEFAULT_RECENT_OFFERS_LIMIT,
        cache_ttl_seconds: float = DEFAULT_CACHE_TTL_SECONDS,
        bot_identity_resolver: BotIdentityResolver | None = None,
        lote_repository: LoteRepository | None = None,
    ) -> None:
        self._db = db
        self._remate_service = remate_service
        self._oferta_repository = oferta_repository
        self._cache = cache
        self._recent_offers_limit = recent_offers_limit
        self._cache_ttl_seconds = cache_ttl_seconds
        # Opcional (default `None` -> `BotIdentityResolver(db)`) para no romper a
        # ningún caller existente que todavía no lo pase explícitamente -- mismo
        # criterio permisivo que `cache: RedisCache | None`.
        self._bot_identity_resolver = bot_identity_resolver or BotIdentityResolver(db)
        # Igual criterio para `lote_repository`: solo lo usa `get_lote_recent_offers`
        # (Timed Auctions, historial de ofertas para compradores por lote puntual, en
        # vez del único "lote OPEN" que asume `build`/`_get_open_lote`).
        self._lote_repository = lote_repository or LoteRepository(db)

    async def assert_visible(self, remate_id: uuid.UUID, viewer: User | None) -> None:
        """Levanta `NotFoundError` (mismo criterio anti-enumeración que `build`, no
        distingue "no existe" de "existe pero no es tuyo") si `remate_id` no existe o
        no es visible para `viewer` -- sin construir ningún snapshot.

        Fase 2 de remediación del WebSocket Security Audit: el Gateway
        (`app/websocket/router.py::_handle_join_room`) la usa para autorizar el ingreso
        a una sala **antes** de crear la membresía, reutilizando la misma
        `RemateService` que este servicio ya tiene inyectada -- sin este método, el
        Gateway necesitaría su propia dependencia de `RemateService`, violando la regla
        "el Gateway WebSocket nunca debe conocer lógica de negocio" que
        `tests/test_architecture_boundaries.py::test_gateway_websocket_never_imports_domain`
        verifica de forma estática (`SnapshotService` es, junto con `PresenceService`/
        `ModerationService`, de los pocos paquetes "de negocio" que el Gateway sí tiene
        permitido conocer)."""
        await self._remate_service.get_visible_or_raise(remate_id, viewer)

    async def get_lote_recent_offers(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        viewer: User | None,
        *,
        limit: int | None = None,
    ) -> list[OfertaSnapshotEntry]:
        """Últimas ofertas de UN lote puntual, enmascaradas para `viewer` -- versión de
        `_load_raw_state`/`_mask_oferta` para Timed Auctions (Épica de Timed Auctions):
        a diferencia de LIVE, acá pueden convivir varios lotes `open` a la vez (no existe
        "el" lote activo del remate), así que el caller elige explícitamente `lote_id` en
        vez de depender de `_get_open_lote`. Nunca pasa por la cache de `RawRemateState`
        (esa cache es por `remate_id`, pensada para un único recorte por remate; acá el
        recorte es por lote) -- consulta directa, igual de barata (mismo índice que ya
        usa `_load_raw_state`).

        Mismo criterio de visibilidad/enmascarado que `build`: `NotFoundError` si el
        remate no es visible o el lote no le pertenece (anti-enumeración), `buyer_id`
        anulado salvo para el dueño del remate, un admin, o el propio autor de esa
        oferta puntual (ver `_mask_oferta`)."""
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        lote = await self._lote_repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        is_privileged = self._is_privileged(remate, viewer)
        viewer_id = viewer.id if viewer is not None else None
        offers, _total = await self._oferta_repository.list_by_lote(
            lote_id=lote_id, offset=0, limit=limit or self._recent_offers_limit
        )
        entries = [OfertaSnapshotEntry.model_validate(o) for o in offers]

        buyer_ids = {entry.buyer_id for entry in entries if entry.buyer_id is not None}
        bot_user_ids = await self._bot_identity_resolver.resolve(list(buyer_ids))
        entries = [
            entry.model_copy(update={"is_bot": True}) if entry.buyer_id in bot_user_ids else entry
            for entry in entries
        ]

        return [self._mask_oferta(entry, is_privileged, viewer_id) for entry in entries]

    async def build(
        self,
        remate_id: uuid.UUID,
        viewer: User | None,
        *,
        connected_users: int = 0,
        connected_users_detail: list[ConnectedUserSummary] | None = None,
    ) -> RemateStateSnapshot:
        """Levanta `NotFoundError` (propagada de `RemateService.get_visible_or_raise`,
        `app/core/exceptions.py`) si el remate no existe o no es visible para `viewer` —
        el mismo criterio de visibilidad que ya aplica `GET /remates/{id}`, para que un
        snapshot nunca exponga más de lo que ese endpoint ya expondría.

        `connected_users_detail` (Épica 6, Módulo 6.2) llega como una lista simple de
        `ConnectedUserSummary` -- nunca un `RoomManager`/`ConnectionManager` -- mismo
        criterio que `connected_users: int` (ADR-026, sección C): este servicio no se
        acopla a cómo cada transporte lleva la cuenta de conexiones."""
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        is_privileged = self._is_privileged(remate, viewer)
        viewer_id = viewer.id if viewer is not None else None

        raw = await self._get_raw_state(remate_id)

        snapshot = RemateStateSnapshot(
            remate=RemateRead.model_validate(remate),
            active_lote=self._mask_lote(raw.active_lote, is_privileged),
            winning_offer=self._mask_oferta(raw.winning_offer, is_privileged, viewer_id),
            recent_offers=[
                self._mask_oferta(o, is_privileged, viewer_id) for o in raw.recent_offers
            ],
            connected_users=connected_users,
            connected_users_detail=self._mask_connected_users_detail(
                connected_users_detail, is_privileged
            ),
            generated_at=datetime.now(UTC),
        )
        logger.info(
            "snapshot_built",
            remate_id=str(remate_id),
            viewer_id=str(viewer.id) if viewer is not None else None,
            has_active_lote=snapshot.active_lote is not None,
            recent_offers_count=len(snapshot.recent_offers),
            connected_users=connected_users,
        )
        return snapshot

    # --- Estado crudo (cacheable, sin enmascarar) -------------------------------------

    async def _get_raw_state(self, remate_id: uuid.UUID) -> RawRemateState:
        cached = await self._read_cache(remate_id)
        if cached is not None:
            return cached

        raw = await self._load_raw_state(remate_id)
        await self._write_cache(remate_id, raw)
        return raw

    async def _load_raw_state(self, remate_id: uuid.UUID) -> RawRemateState:
        """Tres consultas como máximo, todas indexadas: el lote OPEN (índice único
        parcial de ADR-017), su oferta líder (índice único parcial de ADR-020) y sus
        últimas N ofertas (`ORDER BY created_at DESC LIMIT N`, ya paginado en
        `OfertaRepository.list_by_lote`). Sin lote OPEN, ninguna de las otras dos hace
        falta -- se corta ahí (optimización de consultas: nunca se pide oferta líder ni
        historial de un lote que no existe)."""
        active_lote = await self._get_open_lote(remate_id)
        if active_lote is None:
            return RawRemateState()

        leading = await self._oferta_repository.get_leading_offer(active_lote.id)
        recent_offers, _total = await self._oferta_repository.list_by_lote(
            lote_id=active_lote.id, offset=0, limit=self._recent_offers_limit
        )

        winning_offer = OfertaSnapshotEntry.model_validate(leading) if leading else None
        recent_entries = [OfertaSnapshotEntry.model_validate(o) for o in recent_offers]

        # `is_bot` se resuelve acá (antes de cachear, ver docstring de
        # `OfertaSnapshotEntry`) con una única consulta para todos los `buyer_id` del
        # recorte -- nunca una consulta por oferta.
        buyer_ids = {entry.buyer_id for entry in recent_entries if entry.buyer_id is not None}
        if winning_offer is not None and winning_offer.buyer_id is not None:
            buyer_ids.add(winning_offer.buyer_id)
        bot_user_ids = await self._bot_identity_resolver.resolve(list(buyer_ids))

        if winning_offer is not None and winning_offer.buyer_id in bot_user_ids:
            winning_offer = winning_offer.model_copy(update={"is_bot": True})
        recent_entries = [
            entry.model_copy(update={"is_bot": True}) if entry.buyer_id in bot_user_ids else entry
            for entry in recent_entries
        ]

        return RawRemateState(
            active_lote=LoteRead.model_validate(active_lote),
            winning_offer=winning_offer,
            recent_offers=recent_entries,
        )

    async def _get_open_lote(self, remate_id: uuid.UUID) -> Lote | None:
        """Consulta nueva y deliberada (no existe un `get_open_lote` reusable en
        `LoteRepository`, ver ADR-026 sección B) -- un único `SELECT` con `LIMIT 1`
        sobre el índice único parcial `uq_lotes_remate_id_open_status` (ADR-017), en vez
        de traer todos los lotes del remate y filtrar en Python
        (`list_all_by_remate`)."""
        stmt = (
            select(Lote)
            .where(
                Lote.remate_id == remate_id,
                Lote.status == LoteStatus.OPEN,
                Lote.deleted_at.is_(None),
            )
            .limit(1)
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    # --- Cache (Redis, best-effort) ----------------------------------------------------

    async def _read_cache(self, remate_id: uuid.UUID) -> RawRemateState | None:
        if self._cache is None:
            return None
        try:
            raw_json = await self._cache.get(self._cache_key(remate_id))
        except Exception:
            logger.warning("snapshot_cache_read_failed", remate_id=str(remate_id))
            return None
        if raw_json is None:
            return None
        try:
            return RawRemateState.model_validate_json(raw_json)
        except ValidationError:
            logger.warning("snapshot_cache_corrupted", remate_id=str(remate_id))
            return None

    async def _write_cache(self, remate_id: uuid.UUID, raw: RawRemateState) -> None:
        if self._cache is None:
            return
        try:
            # `RedisCache.set` (app/redis/cache.py, sin modificar) solo convierte a
            # entero un `timedelta` -- un `float` crudo se manda tal cual al comando
            # `EX` de Redis, que lo rechaza (debe ser un entero de segundos). Por eso
            # acá se envuelve explícitamente en `timedelta`, con la consecuencia de que
            # el TTL efectivo se trunca a segundos enteros (`int(timedelta.total_seconds())`,
            # ya truncado dentro de `RedisCache`) -- ver ADR-026, sección E.
            await self._cache.set(
                self._cache_key(remate_id),
                raw.model_dump_json(),
                ttl=timedelta(seconds=self._cache_ttl_seconds),
            )
        except Exception:
            # Best-effort, mismo criterio que RedisEventBus.publish (ADR-022, sección
            # D): una caché que no se pudo escribir no debe impedir entregar el
            # snapshot que ya se calculó -- la próxima consulta vuelve a la base.
            logger.warning("snapshot_cache_write_failed", remate_id=str(remate_id))

    @staticmethod
    def _cache_key(remate_id: uuid.UUID) -> str:
        return f"snapshot:{remate_id}"

    # --- Enmascarado (depende del viewer, nunca se cachea enmascarado) ----------------

    @staticmethod
    def _is_privileged(remate: Remate, viewer: User | None) -> bool:
        """Mismo criterio que `RemateService._is_visible`/`LoteService._mask_reserve_price`
        (dueño del remate o administrador) -- se reimplementa acá (no se importa el
        método privado de `LoteService`) para no depender de un detalle interno de otro
        módulo; es la misma regla de una línea en los tres lugares, documentada en
        ADR-026 sección D. Un visitante anónimo (ADR-049) nunca es privilegiado."""
        if viewer is None:
            return False
        return viewer.role == UserRole.ADMIN or viewer.id == remate.owner_id

    @staticmethod
    def _mask_lote(lote: LoteRead | None, is_privileged: bool) -> LoteRead | None:
        if lote is None or is_privileged:
            return lote
        return lote.model_copy(update={"reserve_price": None})

    @staticmethod
    def _mask_oferta(
        oferta: OfertaSnapshotEntry | None,
        is_privileged: bool,
        viewer_id: uuid.UUID | None,
    ) -> OfertaSnapshotEntry | None:
        """El anonimato es entre postores (ADR-031), no de uno mismo: un comprador
        siempre ve su propio `buyer_id` en su propia oferta -- sin esto, no tiene forma
        de saber que la oferta que va ganando es la suya (bug reportado: recargar la
        Sala mientras se lidera un lote lo mostraba como si nadie estuviera liderando,
        habilitando una sobre-oferta contra uno mismo). Cualquier otra oferta ajena
        sigue enmascarada igual que antes."""
        if oferta is None or is_privileged or oferta.buyer_id == viewer_id:
            return oferta
        return oferta.model_copy(update={"buyer_id": None})

    @staticmethod
    def _mask_connected_users_detail(
        detail: list[ConnectedUserSummary] | None, is_privileged: bool
    ) -> list[ConnectedUserSummary] | None:
        """Solo el dueño del remate o un admin ve quién específicamente está conectado
        -- mismo criterio que `_mask_lote`/`_mask_oferta`. El conteo (`connected_users:
        int`) no pasa por acá, sigue visible para cualquiera."""
        if not is_privileged:
            return None
        return detail
