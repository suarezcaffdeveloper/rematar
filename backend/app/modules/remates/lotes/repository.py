"""Acceso a datos del módulo de lotes.

A diferencia de `RemateRepository.list_for_viewer` (que codifica reglas de visibilidad en
SQL), acá la visibilidad se resuelve en `LoteService` a partir del `Remate` padre —
`list_by_remate` simplemente lista los lotes vivos de un remate ya autorizado.
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.lotes.models import Lote, LoteRound, LoteStatus


class LoteRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, lote_id: uuid.UUID) -> Lote | None:
        lote = await self._db.get(Lote, lote_id)
        if lote is not None and lote.deleted_at is not None:
            return None
        return lote

    async def get_by_id_for_update(self, lote_id: uuid.UUID) -> Lote | None:
        """`SELECT ... FOR UPDATE`: pone en práctica el lock de fila de ADR-004 (Fase 0)
        para que `AuctionEngine.place_bid` (app/modules/ofertas/engine.py, Épica 2.4)
        serialice toda oferta concurrente sobre un mismo lote.

        `LoteService._get_owned_lote_or_raise` (Fase 9 de remediación del WebSocket
        Security Audit) también pasa por acá, no por `get_by_id` -- un `SELECT` sin lock
        ahí sólo garantiza que el `UPDATE` final no se pierda (Postgres lo hace esperar
        igual), pero NO evita que la decisión de negocio (¿a qué estado transicionar?,
        ¿con qué `final_price`?) se tome sobre una lectura vieja: dos cierres
        concurrentes podían completar los dos con éxito, el segundo pisando en
        silencio el resultado del primero. Con `FOR UPDATE`, la segunda llamada
        bloquea en el propio `SELECT` y, al desbloquearse, relee el estado ya
        actualizado -- ver el docstring de `_get_owned_lote_or_raise` y
        `tests/test_lote_close_concurrency.py`."""
        stmt = (
            select(Lote)
            .where(Lote.id == lote_id, Lote.deleted_at.is_(None))
            .with_for_update()
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_by_remate(
        self, *, remate_id: uuid.UUID, offset: int, limit: int
    ) -> tuple[list[Lote], int]:
        stmt = select(Lote).where(Lote.remate_id == remate_id, Lote.deleted_at.is_(None))

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Lote.display_order.asc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    async def list_all_by_remate(self, remate_id: uuid.UUID) -> list[Lote]:
        """Todos los lotes vivos de un remate, sin paginar — usado por `reorder`, que
        necesita el conjunto completo para validar y reescribir `display_order`."""
        stmt = select(Lote).where(Lote.remate_id == remate_id, Lote.deleted_at.is_(None))
        return list((await self._db.execute(stmt)).scalars().all())

    async def next_display_order(self, remate_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(Lote.display_order), -1) + 1).where(
            Lote.remate_id == remate_id, Lote.deleted_at.is_(None)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def count_by_remate(self, remate_id: uuid.UUID) -> int:
        """Usado por `RemateService.start` para validar RF-08 (al menos un lote
        cargado) — cuenta cualquier lote vivo, sin importar su estado."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id, Lote.deleted_at.is_(None)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def has_open_lote(self, remate_id: uuid.UUID) -> bool:
        """RF-12: usado antes de abrir un lote (no puede haber otro ya OPEN) y antes de
        finalizar el remate (no puede haber ninguno OPEN)."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id,
            Lote.status == LoteStatus.OPEN,
            Lote.deleted_at.is_(None),
        )
        return (await self._db.execute(stmt)).scalar_one() > 0

    async def get_next_pending_lote(self, remate_id: uuid.UUID) -> Lote | None:
        """RF-13: el `PENDING` de menor `display_order`, para `LoteService.open_next`."""
        stmt = (
            select(Lote)
            .where(
                Lote.remate_id == remate_id,
                Lote.status == LoteStatus.PENDING,
                Lote.deleted_at.is_(None),
            )
            .order_by(Lote.display_order.asc())
            .limit(1)
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_expired_open_lote_ids(self, now: datetime) -> list[uuid.UUID]:
        """Usado por `TimerExpiryScheduler` (`app/timer/scheduler.py`, Épica 8) --
        candidatos a cerrar automáticamente. Solo IDs, sin `FOR UPDATE`: el scheduler
        vuelve a buscar y bloquea cada uno individualmente (`get_by_id_for_update`) para
        no mantener un lock sobre N filas mientras procesa la lista completa."""
        stmt = select(Lote.id).where(
            Lote.status == LoteStatus.OPEN,
            Lote.timer_ends_at.is_not(None),
            Lote.timer_ends_at <= now,
            Lote.timer_auto_close_enabled.is_(True),
            Lote.deleted_at.is_(None),
        )
        return list((await self._db.execute(stmt)).scalars().all())

    def add(self, lote: Lote) -> None:
        self._db.add(lote)

    def add_round(self, round_: LoteRound) -> None:
        self._db.add(round_)

    async def list_rounds_by_lote(self, lote_id: uuid.UUID) -> list[LoteRound]:
        """Historial de rondas desiertas archivadas de un lote (Módulo de lotes
        desiertos), más reciente primero -- usado por `LoteService.list_rounds`."""
        stmt = (
            select(LoteRound)
            .where(LoteRound.lote_id == lote_id)
            .order_by(LoteRound.round_number.desc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, lote: Lote) -> None:
        await self._db.refresh(lote)
