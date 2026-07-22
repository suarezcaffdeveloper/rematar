"""`HistoryService` (Épica 7, Módulo 7.3). Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040.

Compone `RemateService` (visibilidad/ownership, mismo patrón que
`AnalyticsService`/`AuditService`) + `AnalyticsRepository` (métricas finales,
reutilizadas tal cual) + `LoteRepository`/`OfertaRepository` (detalle de lote,
reutilizados tal cual) + `HistoryRepository` (lo genuinamente nuevo). No importa
`AnalyticsService` ni `AuditService` -- ver docstring de `app/history/__init__.py`.
"""

import uuid
from datetime import UTC, datetime

from app.analytics.repository import AnalyticsRepository
from app.analytics.schemas import HighestOferta, LoteStatusCounts, TopLoteByOffers
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.history.repository import HistoryRepository
from app.history.schemas import (
    ChatActivitySummary,
    FinishedRemateSummary,
    HistoryListFilters,
    LoteHistoryDetail,
    LoteWinner,
    OfertaHistoryEntry,
    Page,
    RemateHistoryDetail,
)
from app.modules.ofertas.models import Oferta
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.lotes.models import LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate, RemateStatus
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

_TERMINAL_STATUSES = (RemateStatus.FINISHED, RemateStatus.CANCELLED)


class HistoryService:
    def __init__(
        self,
        repository: HistoryRepository,
        remate_service: RemateService,
        analytics_repository: AnalyticsRepository,
        lote_repository: LoteRepository,
        oferta_repository: OfertaRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._analytics_repository = analytics_repository
        self._lote_repository = lote_repository
        self._oferta_repository = oferta_repository

    # --- Listado -------------------------------------------------------------------------

    async def list_finished(
        self, *, viewer: User, filters: HistoryListFilters, page: int, page_size: int
    ) -> tuple[list[FinishedRemateSummary], int]:
        """`admin` ve el listado global; el rematador dueño, solo el suyo (forzado, no
        un filtro opcional); cualquier otro rol -- 403. Mismo alcance que pide el
        enunciado: "rematadores y administradores"."""
        if viewer.role == UserRole.COMPRADOR:
            raise ForbiddenError(
                "Solo rematadores y administradores pueden ver el historial de remates."
            )
        owner_id = None if viewer.role == UserRole.ADMIN else viewer.id

        offset = (page - 1) * page_size
        rows, total = await self._repository.list_finished_summaries(
            owner_id=owner_id,
            search=filters.search,
            date_from=filters.date_from,
            date_to=filters.date_to,
            sort=filters.sort,
            offset=offset,
            limit=page_size,
        )

        owners = await self._repository.get_users_by_ids({row.owner_id for row in rows})
        summaries = [self._build_summary(row, owners) for row in rows]
        return summaries, total

    @staticmethod
    def _build_summary(row, owners: dict[uuid.UUID, User]) -> FinishedRemateSummary:
        duration = None
        if row.first_opened is not None and row.last_closed is not None:
            duration = (row.last_closed - row.first_opened).total_seconds()
        owner = owners.get(row.owner_id)
        return FinishedRemateSummary(
            id=row.id,
            title=row.title,
            category=row.category,
            status=row.status,
            starts_at=row.starts_at,
            resolved_at=row.resolved_at,
            lote_count=row.lote_count,
            lotes_sold_count=row.lotes_sold_count,
            total_awarded_value=row.total_awarded_value,
            buyer_count=row.buyer_count,
            duration_seconds=duration,
            owner_id=row.owner_id,
            owner_name=owner.full_name if owner else None,
        )

    # --- Detalle de remate -----------------------------------------------------------------

    async def get_detail(self, remate_id: uuid.UUID, viewer: User) -> RemateHistoryDetail:
        remate = await self._get_finished_remate_or_raise(remate_id, viewer)

        lote_row = await self._analytics_repository.get_lote_status_aggregates(remate_id)
        total_ofertas = await self._analytics_repository.count_total_ofertas(remate_id)
        highest_row = await self._analytics_repository.get_highest_oferta(remate_id)
        top_lote_row = await self._analytics_repository.get_top_lote_by_offer_count(remate_id)
        first_opened, last_closed = await self._repository.get_remate_duration(remate_id)
        chat_row = await self._repository.get_chat_activity(remate_id)
        participants_count = await self._repository.get_distinct_participant_count(remate_id)

        duration = None
        if first_opened is not None and last_closed is not None:
            duration = (last_closed - first_opened).total_seconds()

        return RemateHistoryDetail(
            remate_id=remate.id,
            title=remate.title,
            category=remate.category,
            status=remate.status,
            starts_at=remate.starts_at,
            finished_at=remate.finished_at,
            cancelled_at=remate.cancelled_at,
            cancellation_reason=remate.cancellation_reason,
            duration_seconds=duration,
            lote_status_counts=LoteStatusCounts(
                pending=lote_row.pending,
                open=lote_row.open,
                closed_sold=lote_row.closed_sold,
                closed_unsold=lote_row.closed_unsold,
                cancelled=lote_row.cancelled,
                total=lote_row.total,
            ),
            average_lote_duration_seconds=lote_row.average_duration_seconds,
            total_awarded_value=lote_row.total_awarded_value,
            total_ofertas=total_ofertas,
            highest_oferta=HighestOferta.from_row(highest_row) if highest_row is not None else None,
            top_lote_by_offers=(
                TopLoteByOffers.from_row(top_lote_row) if top_lote_row is not None else None
            ),
            chat_activity=ChatActivitySummary(
                message_count=chat_row.message_count,
                deleted_count=chat_row.deleted_count,
                participant_count=chat_row.participant_count,
            ),
            participants_count=participants_count,
            generated_at=datetime.now(UTC),
        )

    # --- Detalle de lote -------------------------------------------------------------------

    async def get_lote_detail(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        viewer: User,
        *,
        page: int,
        page_size: int,
    ) -> LoteHistoryDetail:
        await self._get_finished_remate_or_raise(remate_id, viewer)

        lote = await self._lote_repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        offset = (page - 1) * page_size
        ofertas, offer_total = await self._oferta_repository.list_by_lote(
            lote_id=lote_id, offset=offset, limit=page_size
        )

        # El ganador solo tiene sentido para un lote efectivamente vendido -- un lote
        # `closed_unsold`/`cancelled` puede igual tener una oferta ACCEPTED en la base
        # (cerrar no cambia el estado de las ofertas), pero eso no es "el ganador".
        winner_oferta: Oferta | None = None
        if lote.status == LoteStatus.CLOSED_SOLD:
            winner_oferta = await self._oferta_repository.get_leading_offer(lote_id)

        buyer_ids = {oferta.buyer_id for oferta in ofertas}
        if winner_oferta is not None:
            buyer_ids.add(winner_oferta.buyer_id)
        buyers = await self._repository.get_users_by_ids(buyer_ids)

        time_open = None
        if lote.opened_at is not None and lote.closed_at is not None:
            time_open = (lote.closed_at - lote.opened_at).total_seconds()

        winner = None
        if winner_oferta is not None:
            buyer = buyers.get(winner_oferta.buyer_id)
            winner = LoteWinner(
                buyer_id=winner_oferta.buyer_id,
                buyer_name=buyer.full_name if buyer else None,
                amount=winner_oferta.amount,
            )

        offer_history = [
            OfertaHistoryEntry(
                id=oferta.id,
                buyer_id=oferta.buyer_id,
                buyer_name=(buyers[oferta.buyer_id].full_name if oferta.buyer_id in buyers else None),
                amount=oferta.amount,
                status=oferta.status,
                rejection_reason=oferta.rejection_reason,
                created_at=oferta.created_at,
            )
            for oferta in ofertas
        ]

        return LoteHistoryDetail(
            id=lote.id,
            remate_id=remate_id,
            lot_number=lote.lot_number,
            title=lote.title,
            category=lote.category,
            status=lote.status,
            base_price=lote.base_price,
            final_price=lote.final_price,
            winner=winner,
            offer_count=offer_total,
            time_open_seconds=time_open,
            opened_at=lote.opened_at,
            closed_at=lote.closed_at,
            cancellation_reason=lote.cancellation_reason,
            offer_history=Page[OfertaHistoryEntry](
                items=offer_history, total=offer_total, page=page, page_size=page_size
            ),
        )

    # --- Compartido --------------------------------------------------------------------

    async def _get_finished_remate_or_raise(self, remate_id: uuid.UUID, viewer: User) -> Remate:
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        if not self._is_privileged(remate, viewer):
            raise ForbiddenError(
                "Solo el dueño del remate o un administrador pueden ver su historial."
            )
        if remate.status not in _TERMINAL_STATUSES:
            raise BusinessRuleError(
                "El historial solo está disponible para remates finalizados o cancelados.",
                current_status=remate.status.value,
            )
        return remate

    @staticmethod
    def _is_privileged(remate: Remate, viewer: User) -> bool:
        """Mismo criterio que `AnalyticsService`/`AuditService` -- una línea, no vale la
        pena compartirla entre módulos."""
        return viewer.role == UserRole.ADMIN or viewer.id == remate.owner_id
