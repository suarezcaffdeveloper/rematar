"""Acceso a datos del Analytics Service (Épica 7, Módulo 7.1). Ver
docs/35-dashboard-analitica-tiempo-real.md y ADR-038.

Consultas nuevas y deliberadas, directas sobre `Oferta`/`Lote`/`User` -- mismo criterio
que `SnapshotService._get_open_lote` (`app/snapshot/service.py`): no existe un método
reusable en `OfertaRepository`/`LoteRepository`/`UserRepository` para ninguna de estas
agregaciones, y agregarlas ahí acoplaría esos repositorios a un caso de uso de solo
lectura que no les pertenece. Ninguno de los tres archivos existentes se toca.

`Oferta` no tiene `remate_id` propio -- todo lo que agrega sobre "las ofertas de este
remate" hace `JOIN lotes` (índice `ix_ofertas_lote_id_created_at` + `lotes(remate_id)`,
ambos ya existentes). Deliberadamente no se denormaliza `remate_id` en `Oferta`: la
cantidad de lotes por remate está acotada (RF-08, catálogos de decenas/cientos, nunca
sin límite), así que el join no es un cuello de botella real -- ver ADR-038, sección B.
"""

import uuid
from datetime import datetime

from sqlalchemy import Row, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ofertas.models import Oferta, OfertaStatus
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.users.models import User, UserRole


class AnalyticsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def count_total_ofertas(self, remate_id: uuid.UUID) -> int:
        """Todo intento de oferta persistido (incluidas las rechazadas, RF-25) -- "total
        de ofertas realizadas" cuenta intentos, no solo las aceptadas."""
        stmt = (
            select(func.count())
            .select_from(Oferta)
            .join(Lote, Oferta.lote_id == Lote.id)
            .where(Lote.remate_id == remate_id)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def count_ofertas_since(self, remate_id: uuid.UUID, since: datetime) -> int:
        """Ventana móvil (ej. últimos 60s) para "ofertas por minuto" -- inclusiva en el
        límite inferior (`>=`)."""
        stmt = (
            select(func.count())
            .select_from(Oferta)
            .join(Lote, Oferta.lote_id == Lote.id)
            .where(Lote.remate_id == remate_id, Oferta.created_at >= since)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def get_lote_status_aggregates(self, remate_id: uuid.UUID) -> Row:
        """Una sola consulta (`COUNT(*) FILTER (WHERE ...)`, `AVG`/`SUM` con el mismo
        `FILTER`) para lotes vendidos/no vendidos/restantes/cancelados/total, tiempo
        promedio por lote y valor total adjudicado -- evita tres round trips separados
        sobre el mismo conjunto de filas. `average_duration_seconds` excluye lotes sin
        `opened_at`/`closed_at` (nunca se abrieron, o siguen abiertos/pendientes/
        cancelados); `total_awarded_value` usa `COALESCE(..., 0)` para no devolver
        `None` cuando todavía no se vendió ningún lote."""
        duration_seconds = func.extract("epoch", Lote.closed_at - Lote.opened_at)
        stmt = select(
            func.count().filter(Lote.status == LoteStatus.PENDING).label("pending"),
            func.count().filter(Lote.status == LoteStatus.OPEN).label("open"),
            func.count().filter(Lote.status == LoteStatus.CLOSED_SOLD).label("closed_sold"),
            func.count().filter(Lote.status == LoteStatus.CLOSED_UNSOLD).label("closed_unsold"),
            func.count().filter(Lote.status == LoteStatus.CANCELLED).label("cancelled"),
            func.count().label("total"),
            func.avg(duration_seconds)
            .filter(Lote.opened_at.is_not(None), Lote.closed_at.is_not(None))
            .label("average_duration_seconds"),
            func.coalesce(
                func.sum(Lote.final_price).filter(Lote.status == LoteStatus.CLOSED_SOLD), 0
            ).label("total_awarded_value"),
        ).where(Lote.remate_id == remate_id, Lote.deleted_at.is_(None))
        return (await self._db.execute(stmt)).one()

    async def get_highest_oferta(self, remate_id: uuid.UUID) -> Row | None:
        """Excluye `REJECTED` -- no son ofertas válidas en pie, no representan "cuánto
        se ofertó" de verdad. Empate en `amount`: gana la más antigua
        (`created_at ASC`), para que el resultado sea determinístico."""
        stmt = (
            select(
                Oferta.id.label("oferta_id"),
                Oferta.lote_id,
                Oferta.buyer_id,
                Oferta.amount,
                Oferta.status,
                Oferta.created_at,
                Lote.lot_number,
                Lote.title.label("lote_title"),
            )
            .join(Lote, Oferta.lote_id == Lote.id)
            .where(
                Lote.remate_id == remate_id,
                Oferta.status.in_(
                    (OfertaStatus.ACCEPTED, OfertaStatus.OUTBID, OfertaStatus.WINNING)
                ),
            )
            .order_by(Oferta.amount.desc(), Oferta.created_at.asc())
            .limit(1)
        )
        return (await self._db.execute(stmt)).first()

    async def get_top_lote_by_offer_count(self, remate_id: uuid.UUID) -> Row | None:
        stmt = (
            select(
                Oferta.lote_id,
                Lote.lot_number,
                Lote.title.label("lote_title"),
                func.count(Oferta.id).label("offer_count"),
            )
            .join(Lote, Oferta.lote_id == Lote.id)
            .where(Lote.remate_id == remate_id)
            .group_by(Oferta.lote_id, Lote.lot_number, Lote.title)
            .order_by(func.count(Oferta.id).desc())
            .limit(1)
        )
        return (await self._db.execute(stmt)).first()

    async def get_bids_timeline(self, remate_id: uuid.UUID, since: datetime) -> list[Row]:
        """Bucketed por minuto (`date_trunc`) -- el servicio zero-fillea los minutos sin
        ofertas (esta consulta solo devuelve los que tuvieron al menos una)."""
        bucket = func.date_trunc("minute", Oferta.created_at).label("bucket_start")
        stmt = (
            select(bucket, func.count(Oferta.id).label("count"))
            .select_from(Oferta)
            .join(Lote, Oferta.lote_id == Lote.id)
            .where(Lote.remate_id == remate_id, Oferta.created_at >= since)
            .group_by(bucket)
            .order_by(bucket)
        )
        return list((await self._db.execute(stmt)).all())

    async def list_lote_transitions(self, remate_id: uuid.UUID, *, limit: int) -> list[Lote]:
        """Los `limit` lotes cuyo timestamp más reciente (`closed_at` si existe, si no
        `opened_at`) es más nuevo -- cota superior segura para los `limit` eventos más
        recientes: cada lote aporta como máximo 2 (abrió, cerró), y como `closed_at` es
        siempre posterior a `opened_at` cuando ambos existen, ordenar los LOTES por su
        propio timestamp más reciente garantiza que ningún lote fuera del top `limit`
        podría aportar un evento más reciente que uno ya incluido. El servicio
        (`AnalyticsService`) explota cada fila en hasta 2 `RecentAnalyticsEvent`."""
        most_recent = func.coalesce(Lote.closed_at, Lote.opened_at)
        stmt = (
            select(Lote)
            .where(
                Lote.remate_id == remate_id,
                Lote.deleted_at.is_(None),
                or_(Lote.opened_at.is_not(None), Lote.closed_at.is_not(None)),
            )
            .order_by(most_recent.desc())
            .limit(limit)
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def get_roles_by_ids(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, UserRole]:
        """Resuelve `user_id -> role` para el detalle de conectados de Presencia (que
        deliberadamente no conoce roles, ver ADR-036 sección J) -- sin tocar
        `UserRepository`, esta es la única consulta de todo el módulo que lee `User`."""
        if not user_ids:
            return {}
        stmt = select(User.id, User.role).where(User.id.in_(user_ids))
        rows = (await self._db.execute(stmt)).all()
        return {row.id: row.role for row in rows}
