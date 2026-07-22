"""Acceso a datos del History Service (Épica 7, Módulo 7.3). Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040.

Solo lo genuinamente nuevo -- el detalle de un remate/lote reutiliza
`AnalyticsRepository`/`LoteRepository`/`OfertaRepository` directo desde
`HistoryService`, sin pasar por acá. Mismo criterio que `AnalyticsRepository`: consultas
propias, directas sobre los modelos de otros módulos, sin tocar sus repositorios.
"""

import uuid
from datetime import datetime

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.ofertas.models import Oferta
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.models import Remate, RemateStatus
from app.modules.users.models import User

_TERMINAL_STATUSES = (RemateStatus.FINISHED, RemateStatus.CANCELLED)

_SORT_COLUMNS = {
    "date_desc": lambda resolved_at, total_awarded: resolved_at.desc(),
    "date_asc": lambda resolved_at, total_awarded: resolved_at.asc(),
    "title_asc": lambda resolved_at, total_awarded: Remate.title.asc(),
    "title_desc": lambda resolved_at, total_awarded: Remate.title.desc(),
    "amount_desc": lambda resolved_at, total_awarded: total_awarded.desc(),
    "amount_asc": lambda resolved_at, total_awarded: total_awarded.asc(),
}


class HistoryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_finished_summaries(
        self,
        *,
        owner_id: uuid.UUID | None,
        search: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        sort: str,
        offset: int,
        limit: int,
    ) -> tuple[list[Row], int]:
        """Dos subconsultas agregadas por `remate_id` (lotes, ofertas), unidas con
        `LEFT JOIN` sobre `remates` -- **no** un único join triple
        (`remates JOIN lotes JOIN ofertas`): eso duplicaría filas de `lotes` por cada
        oferta asociada y rompería `SUM(final_price)`/`COUNT(lotes)` por fan-out. Cada
        subconsulta ya agrega 1:1 por remate, así que el `LEFT JOIN` final no duplica
        nada -- ver ADR-040."""
        lote_agg = (
            select(
                Lote.remate_id.label("remate_id"),
                func.count().label("lote_count"),
                func.count().filter(Lote.status == LoteStatus.CLOSED_SOLD).label("lotes_sold_count"),
                func.coalesce(
                    func.sum(Lote.final_price).filter(Lote.status == LoteStatus.CLOSED_SOLD), 0
                ).label("total_awarded_value"),
                func.min(Lote.opened_at).label("first_opened"),
                func.max(Lote.closed_at).label("last_closed"),
            )
            .where(Lote.deleted_at.is_(None))
            .group_by(Lote.remate_id)
            .subquery()
        )
        buyer_agg = (
            select(
                Lote.remate_id.label("remate_id"),
                func.count(func.distinct(Oferta.buyer_id)).label("buyer_count"),
            )
            .select_from(Oferta)
            .join(Lote, Oferta.lote_id == Lote.id)
            .group_by(Lote.remate_id)
            .subquery()
        )

        resolved_at = func.coalesce(Remate.finished_at, Remate.cancelled_at)
        total_awarded = func.coalesce(lote_agg.c.total_awarded_value, 0)

        stmt = (
            select(
                Remate.id,
                Remate.title,
                Remate.category,
                Remate.status,
                Remate.starts_at,
                Remate.owner_id,
                resolved_at.label("resolved_at"),
                func.coalesce(lote_agg.c.lote_count, 0).label("lote_count"),
                func.coalesce(lote_agg.c.lotes_sold_count, 0).label("lotes_sold_count"),
                total_awarded.label("total_awarded_value"),
                lote_agg.c.first_opened,
                lote_agg.c.last_closed,
                func.coalesce(buyer_agg.c.buyer_count, 0).label("buyer_count"),
            )
            .select_from(Remate)
            .outerjoin(lote_agg, lote_agg.c.remate_id == Remate.id)
            .outerjoin(buyer_agg, buyer_agg.c.remate_id == Remate.id)
            .where(Remate.deleted_at.is_(None), Remate.status.in_(_TERMINAL_STATUSES))
        )

        if owner_id is not None:
            stmt = stmt.where(Remate.owner_id == owner_id)
        if search:
            stmt = stmt.where(Remate.title.ilike(f"%{search}%"))
        if date_from is not None:
            stmt = stmt.where(resolved_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(resolved_at <= date_to)

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        order = _SORT_COLUMNS.get(sort, _SORT_COLUMNS["date_desc"])(resolved_at, total_awarded)
        stmt = stmt.order_by(order, Remate.id.desc()).offset(offset).limit(limit)
        rows = (await self._db.execute(stmt)).all()
        return list(rows), total

    async def get_remate_duration(
        self, remate_id: uuid.UUID
    ) -> tuple[datetime | None, datetime | None]:
        """`MIN(opened_at)`/`MAX(closed_at)` entre los lotes del remate -- la duración
        real de la actividad de bidding, no `finished_at - starts_at` (que mide desde la
        fecha *programada*, no desde que el remate efectivamente arrancó -- `Remate` no
        persiste `started_at`, ver ADR-038 sección F)."""
        stmt = select(func.min(Lote.opened_at), func.max(Lote.closed_at)).where(
            Lote.remate_id == remate_id, Lote.deleted_at.is_(None)
        )
        row = (await self._db.execute(stmt)).one()
        return row[0], row[1]

    async def get_chat_activity(self, remate_id: uuid.UUID) -> Row:
        stmt = select(
            func.count().filter(ChatMessage.kind == ChatMessageKind.USER).label("message_count"),
            func.count()
            .filter(ChatMessage.kind == ChatMessageKind.USER, ChatMessage.deleted_at.is_not(None))
            .label("deleted_count"),
            func.count(func.distinct(ChatMessage.author_id))
            .filter(ChatMessage.kind == ChatMessageKind.USER)
            .label("participant_count"),
        ).where(ChatMessage.remate_id == remate_id)
        return (await self._db.execute(stmt)).one()

    async def get_distinct_participant_count(self, remate_id: uuid.UUID) -> int:
        """Aproximación de "usuarios conectados durante el evento" (ver docstring de
        `RemateHistoryDetail.participants_count`): unión (sin duplicados, `UNION` no
        `UNION ALL`) de compradores que ofertaron y autores de mensajes de chat."""
        buyer_ids = (
            select(Oferta.buyer_id).join(Lote, Oferta.lote_id == Lote.id).where(Lote.remate_id == remate_id)
        )
        author_ids = select(ChatMessage.author_id).where(
            ChatMessage.remate_id == remate_id,
            ChatMessage.kind == ChatMessageKind.USER,
            ChatMessage.author_id.is_not(None),
        )
        union_subquery = buyer_ids.union(author_ids).subquery()
        stmt = select(func.count()).select_from(union_subquery)
        return (await self._db.execute(stmt)).scalar_one()

    async def get_users_by_ids(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
        """Mismo patrón que `AnalyticsRepository.get_roles_by_ids`: resuelve nombres
        (dueño, ganador de un lote, compradores del historial de ofertas) sin tocar
        `UserRepository`."""
        if not user_ids:
            return {}
        stmt = select(User).where(User.id.in_(user_ids))
        rows = (await self._db.execute(stmt)).scalars().all()
        return {user.id: user for user in rows}
