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

    async def summaries_by_remates(
        self,
        remate_ids: list[uuid.UUID],
        *,
        cover_remate_ids: list[uuid.UUID],
        cover_limit: int,
    ) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, list[str]]]:
        """Cantidad de lotes vivos de cada remate y, para `cover_remate_ids`, las primeras
        `cover_limit` fotos de lote (la primera imagen de cada uno, en `display_order`),
        en dos consultas para todos a la vez -- el listado de remates las usa en lugar de
        que el cliente pida los lotes de cada fila por separado."""
        if not remate_ids:
            return {}, {}

        count_stmt = (
            select(Lote.remate_id, func.count())
            .where(Lote.remate_id.in_(remate_ids), Lote.deleted_at.is_(None))
            .group_by(Lote.remate_id)
        )
        counts = {rid: total for rid, total in (await self._db.execute(count_stmt)).all()}

        covers: dict[uuid.UUID, list[str]] = {}
        if cover_remate_ids:
            ranked = (
                select(
                    Lote.remate_id.label("remate_id"),
                    Lote.images.label("images"),
                    Lote.display_order.label("display_order"),
                    func.row_number()
                    .over(partition_by=Lote.remate_id, order_by=Lote.display_order.asc())
                    .label("rn"),
                )
                .where(
                    Lote.remate_id.in_(cover_remate_ids),
                    Lote.deleted_at.is_(None),
                    func.jsonb_array_length(Lote.images) > 0,
                )
                .subquery()
            )
            cover_stmt = (
                select(ranked.c.remate_id, ranked.c.images)
                .where(ranked.c.rn <= cover_limit)
                .order_by(ranked.c.remate_id, ranked.c.display_order.asc())
            )
            for rid, images in (await self._db.execute(cover_stmt)).all():
                first = min(images, key=lambda image: image.get("order", 0), default=None)
                if first and first.get("url"):
                    covers.setdefault(rid, []).append(first["url"])
        return counts, covers

    async def has_open_lote(self, remate_id: uuid.UUID) -> bool:
        """RF-12: usado antes de abrir un lote (no puede haber otro ya OPEN) y antes de
        finalizar el remate (no puede haber ninguno OPEN)."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id,
            Lote.status == LoteStatus.OPEN,
            Lote.deleted_at.is_(None),
        )
        return (await self._db.execute(stmt)).scalar_one() > 0

    async def list_pending_by_remate(self, remate_id: uuid.UUID) -> list[Lote]:
        """Todos los `PENDING` de un remate, sin bloquear -- usado por
        `LoteService.open_all_pending_for_timed_start` (Timed Auctions), que ya corre
        dentro de una transacción con el `Remate` padre bloqueado
        (`RemateRepository.get_by_id_for_update`): mientras esa fila esté tomada, ningún
        otro caller puede haber tocado la estructura de lotes de este remate (crear un
        lote exige que el remate NO esté LIVE, ver `_assert_structure_editable`, así que
        no puede aparecer un PENDING nuevo concurrentemente acá)."""
        stmt = select(Lote).where(
            Lote.remate_id == remate_id,
            Lote.status == LoteStatus.PENDING,
            Lote.deleted_at.is_(None),
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def list_open_lotes_for_update(self, remate_id: uuid.UUID) -> list[Lote]:
        """Todos los lotes `OPEN` de un remate, bloqueados con `SELECT ... FOR UPDATE`
        -- usado por `RemateService.pause`/`resume` para un remate TIMED, que necesita
        congelar/reanudar el timer de TODOS sus lotes abiertos a la vez de forma
        atómica (ver plan de Timed Auctions). Mismo mecanismo de lock que
        `get_by_id_for_update` (ADR-004), aplicado a varias filas en una sola
        sentencia."""
        stmt = (
            select(Lote)
            .where(
                Lote.remate_id == remate_id,
                Lote.status == LoteStatus.OPEN,
                Lote.deleted_at.is_(None),
            )
            .with_for_update()
        )
        return list((await self._db.execute(stmt)).scalars().all())

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
