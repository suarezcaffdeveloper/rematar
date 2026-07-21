"""`AnalyticsService` (Épica 7, Módulo 7.1). Ver docs/35-dashboard-analitica-tiempo-real.md
y ADR-038.

Compone `RemateService` (visibilidad) + `AnalyticsRepository` (agregados de Postgres,
cacheables) + `PresenceService` (conteo de conectados, nunca cacheado) -- mismo patrón
"compositor sobre infraestructura ya existente" que `SnapshotService`/`PresenceService`.
No persiste nada propio: cada llamada a `build()` es, en el peor caso (cache miss), una
lectura fresca de Postgres + Presencia, nunca una escritura.
"""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from pydantic import ValidationError
from sqlalchemy.engine import Row

from app.analytics.repository import AnalyticsRepository
from app.analytics.schemas import (
    BidsTimelineBucket,
    HighestOferta,
    LoteStatusCounts,
    RawAnalyticsAggregates,
    RecentAnalyticsEvent,
    RemateAnalyticsSnapshot,
    TopLoteByOffers,
)
from app.core.exceptions import ForbiddenError
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.models import Remate
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.presence.schemas import ConnectedUserSummary
from app.presence.service import PresenceService
from app.redis.cache import RedisCache

logger = structlog.get_logger(__name__)

DEFAULT_CACHE_TTL_SECONDS = 3.0
DEFAULT_BIDS_TIMELINE_MINUTES = 20
DEFAULT_RECENT_EVENTS_LIMIT = 15
DEFAULT_OFFERS_RATE_WINDOW_SECONDS = 60


class AnalyticsService:
    def __init__(
        self,
        repository: AnalyticsRepository,
        remate_service: RemateService,
        presence_service: PresenceService,
        *,
        cache: RedisCache | None = None,
        cache_ttl_seconds: float = DEFAULT_CACHE_TTL_SECONDS,
        bids_timeline_minutes: int = DEFAULT_BIDS_TIMELINE_MINUTES,
        recent_events_limit: int = DEFAULT_RECENT_EVENTS_LIMIT,
        offers_rate_window_seconds: int = DEFAULT_OFFERS_RATE_WINDOW_SECONDS,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._presence_service = presence_service
        self._cache = cache
        self._cache_ttl_seconds = cache_ttl_seconds
        self._bids_timeline_minutes = bids_timeline_minutes
        self._recent_events_limit = recent_events_limit
        self._offers_rate_window_seconds = offers_rate_window_seconds

    async def build(self, remate_id: uuid.UUID, viewer: User) -> RemateAnalyticsSnapshot:
        """Levanta `NotFoundError` (propagada de `RemateService.get_visible_or_raise`)
        si el remate no existe o no es visible en absoluto -- mismo criterio que
        cualquier otra lectura. Si es visible pero el viewer no es dueño ni admin,
        levanta `ForbiddenError` (403): a diferencia de `SnapshotService`, acá no hay
        una vista parcial con sentido para un comprador ajeno -- se deniega, no se
        enmascara por campo (ver ADR-038, sección C). Un 403 acá no filtra nada nuevo:
        para cualquier remate no-`DRAFT` (el único estado donde este panel importa) la
        existencia del remate ya es pública."""
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        if not self._is_privileged(remate, viewer):
            raise ForbiddenError(
                "Solo el dueño del remate o un administrador pueden ver su analítica."
            )

        raw = await self._get_raw_aggregates(remate_id, remate)
        connected = self._presence_service.connected_users_summary(remate_id)
        connected_buyers = await self._count_connected_buyers(connected)

        snapshot = RemateAnalyticsSnapshot(
            remate_id=remate_id,
            connected_users_total=len(connected),
            connected_buyers=connected_buyers,
            lote_status_counts=raw.lote_status_counts,
            average_lote_duration_seconds=raw.average_lote_duration_seconds,
            total_awarded_value=raw.total_awarded_value,
            total_ofertas=raw.total_ofertas,
            ofertas_per_minute=raw.ofertas_last_minute,
            highest_oferta=raw.highest_oferta,
            top_lote_by_offers=raw.top_lote_by_offers,
            bids_timeline=raw.bids_timeline,
            recent_events=raw.recent_events,
            generated_at=datetime.now(UTC),
        )
        logger.info(
            "analytics_built",
            remate_id=str(remate_id),
            viewer_id=str(viewer.id),
            total_ofertas=snapshot.total_ofertas,
            connected_users_total=snapshot.connected_users_total,
        )
        return snapshot

    # --- Agregados crudos (cacheables, independientes del viewer) ----------------------

    async def _get_raw_aggregates(
        self, remate_id: uuid.UUID, remate: Remate
    ) -> RawAnalyticsAggregates:
        cached = await self._read_cache(remate_id)
        if cached is not None:
            return cached
        raw = await self._load_raw_aggregates(remate_id, remate)
        await self._write_cache(remate_id, raw)
        return raw

    async def _load_raw_aggregates(
        self, remate_id: uuid.UUID, remate: Remate
    ) -> RawAnalyticsAggregates:
        """Siete consultas, todas sobre la misma `AsyncSession` de request --
        **secuenciales**, nunca `asyncio.gather`: `AsyncSession` no admite operaciones
        concurrentes sobre la misma sesión. Cada una es simple e indexada; la caché
        Redis (`_get_raw_aggregates`) absorbe ráfagas de refetch (por ejemplo, durante
        una guerra de ofertas) sin repetir las siete en cada request."""
        now = datetime.now(UTC)
        since_rate_window = now - timedelta(seconds=self._offers_rate_window_seconds)
        since_timeline = now - timedelta(minutes=self._bids_timeline_minutes)

        total_ofertas = await self._repository.count_total_ofertas(remate_id)
        ofertas_last_minute = await self._repository.count_ofertas_since(
            remate_id, since_rate_window
        )
        lote_row = await self._repository.get_lote_status_aggregates(remate_id)
        highest_row = await self._repository.get_highest_oferta(remate_id)
        top_lote_row = await self._repository.get_top_lote_by_offer_count(remate_id)
        timeline_rows = await self._repository.get_bids_timeline(remate_id, since_timeline)
        transition_lotes = await self._repository.list_lote_transitions(
            remate_id, limit=self._recent_events_limit
        )

        return RawAnalyticsAggregates(
            lote_status_counts=self._build_lote_status_counts(lote_row),
            average_lote_duration_seconds=lote_row.average_duration_seconds,
            total_awarded_value=lote_row.total_awarded_value,
            total_ofertas=total_ofertas,
            ofertas_last_minute=ofertas_last_minute,
            highest_oferta=self._build_highest_oferta(highest_row),
            top_lote_by_offers=self._build_top_lote(top_lote_row),
            bids_timeline=self._build_bids_timeline(timeline_rows, since_timeline, now),
            recent_events=self._build_recent_events(transition_lotes, remate),
        )

    # --- Presencia (nunca cacheada) -----------------------------------------------------

    async def _count_connected_buyers(self, connected: list[ConnectedUserSummary]) -> int:
        """Cuenta **conexiones**, no usuarios únicos -- mismo criterio ya establecido
        por `connected_users`/`PresenceCounter` en todo el resto del proyecto (un
        comprador con dos pestañas cuenta dos veces). El rol se resuelve acá (no en
        `PresenceService`, que deliberadamente no lo conoce, ver ADR-036 sección J)."""
        if not connected:
            return 0
        user_ids = {c.user_id for c in connected}
        roles = await self._repository.get_roles_by_ids(user_ids)
        return sum(1 for c in connected if roles.get(c.user_id) == UserRole.COMPRADOR)

    # --- Construcción de DTOs a partir de las filas del repositorio --------------------

    @staticmethod
    def _build_lote_status_counts(row: Row) -> LoteStatusCounts:
        return LoteStatusCounts(
            pending=row.pending,
            open=row.open,
            closed_sold=row.closed_sold,
            closed_unsold=row.closed_unsold,
            cancelled=row.cancelled,
            total=row.total,
        )

    @staticmethod
    def _build_highest_oferta(row: Row | None) -> HighestOferta | None:
        if row is None:
            return None
        return HighestOferta(
            oferta_id=row.oferta_id,
            lote_id=row.lote_id,
            lot_number=row.lot_number,
            lote_title=row.lote_title,
            buyer_id=row.buyer_id,
            amount=row.amount,
            status=row.status,
            created_at=row.created_at,
        )

    @staticmethod
    def _build_top_lote(row: Row | None) -> TopLoteByOffers | None:
        if row is None:
            return None
        return TopLoteByOffers(
            lote_id=row.lote_id,
            lot_number=row.lot_number,
            lote_title=row.lote_title,
            offer_count=row.offer_count,
        )

    def _build_bids_timeline(
        self, rows: list[Row], since: datetime, now: datetime
    ) -> list[BidsTimelineBucket]:
        """Zero-fillea cada minuto entre `since` y `now` -- un minuto sin ofertas se ve
        como una barra en cero, no desaparece del gráfico (evita confundir "sin datos"
        con "sin actividad")."""
        counts = {row.bucket_start: row.count for row in rows}
        since_minute = since.replace(second=0, microsecond=0)
        now_minute = now.replace(second=0, microsecond=0)
        total_minutes = max(0, int((now_minute - since_minute).total_seconds() // 60))
        buckets: list[BidsTimelineBucket] = []
        for offset in range(total_minutes + 1):
            minute = since_minute + timedelta(minutes=offset)
            buckets.append(BidsTimelineBucket(bucket_start=minute, count=counts.get(minute, 0)))
        return buckets

    def _build_recent_events(
        self, lotes: list[Lote], remate: Remate
    ) -> list[RecentAnalyticsEvent]:
        """Explota cada lote en hasta 2 eventos (abrió/cerró) -- ver docstring de
        `AnalyticsRepository.list_lote_transitions` para por qué el límite pedido a la
        base ya alcanza. No incluye `remate.started`/`paused`/`resumed`: `Remate` no
        persiste esos timestamps (solo `finished_at`/`cancelled_at`) y no existe un
        event store (ADR-009) -- ver ADR-038, sección F."""
        events: list[RecentAnalyticsEvent] = []
        for lote in lotes:
            if lote.opened_at is not None:
                events.append(
                    RecentAnalyticsEvent(
                        event_type="lote.opened",
                        occurred_at=lote.opened_at,
                        lote_id=lote.id,
                        lot_number=lote.lot_number,
                        lote_title=lote.title,
                    )
                )
            if lote.closed_at is not None:
                events.append(
                    RecentAnalyticsEvent(
                        event_type=(
                            "lote.closed_sold"
                            if lote.status == LoteStatus.CLOSED_SOLD
                            else "lote.closed_unsold"
                        ),
                        occurred_at=lote.closed_at,
                        lote_id=lote.id,
                        lot_number=lote.lot_number,
                        lote_title=lote.title,
                        final_price=lote.final_price,
                    )
                )
        if remate.finished_at is not None:
            events.append(
                RecentAnalyticsEvent(event_type="remate.finished", occurred_at=remate.finished_at)
            )
        if remate.cancelled_at is not None:
            events.append(
                RecentAnalyticsEvent(
                    event_type="remate.cancelled", occurred_at=remate.cancelled_at
                )
            )
        events.sort(key=lambda event: event.occurred_at, reverse=True)
        return events[: self._recent_events_limit]

    # --- Cache (Redis, best-effort) -----------------------------------------------------

    async def _read_cache(self, remate_id: uuid.UUID) -> RawAnalyticsAggregates | None:
        if self._cache is None:
            return None
        try:
            raw_json = await self._cache.get(self._cache_key(remate_id))
        except Exception:
            logger.warning("analytics_cache_read_failed", remate_id=str(remate_id))
            return None
        if raw_json is None:
            return None
        try:
            return RawAnalyticsAggregates.model_validate_json(raw_json)
        except ValidationError:
            logger.warning("analytics_cache_corrupted", remate_id=str(remate_id))
            return None

    async def _write_cache(self, remate_id: uuid.UUID, raw: RawAnalyticsAggregates) -> None:
        if self._cache is None:
            return
        try:
            await self._cache.set(
                self._cache_key(remate_id),
                raw.model_dump_json(),
                ttl=timedelta(seconds=self._cache_ttl_seconds),
            )
        except Exception:
            # Best-effort, mismo criterio que SnapshotService/RedisEventBus.publish
            # (ADR-022, sección D): una caché que no se pudo escribir no debe impedir
            # devolver los agregados que ya se calcularon.
            logger.warning("analytics_cache_write_failed", remate_id=str(remate_id))

    @staticmethod
    def _cache_key(remate_id: uuid.UUID) -> str:
        return f"analytics:{remate_id}"

    # --- Control de acceso ---------------------------------------------------------------

    @staticmethod
    def _is_privileged(remate: Remate, viewer: User) -> bool:
        """Mismo criterio que `SnapshotService._is_privileged` (ADR-026, sección D),
        reimplementado localmente acá en vez de importado -- una línea, no vale la pena
        compartirla entre módulos."""
        return viewer.role == UserRole.ADMIN or viewer.id == remate.owner_id
