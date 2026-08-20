"""Lógica de negocio de Lote.

## Alcance (Módulo 2.2 + Módulo 2.3)

CRUD estructural (`create`, `update`, `soft_delete`, `reorder`) más lectura con
visibilidad (`get_visible_or_raise`, `list_for_viewer`) desde el Módulo 2.2 — sigue
intacto, sin cambios de comportamiento.

Motor de estados (Módulo 2.3, ver docs/16-motor-de-estados.md): `open` (abre un lote
puntual por id), `open_next` (abre el `PENDING` de menor `display_order`, RF-13), `close`
(con resultado declarado por el rematador mientras no exista bidding, ver ADR-018) y
`cancel` (distinto de `soft_delete`: `cancel` es una transición de estado con motivo,
válida durante un remate `LIVE`/`PAUSED`; `soft_delete` es una baja estructural, válida
solo en `DRAFT`/`SCHEDULED` — son operaciones distintas a propósito, mismo criterio que
`Remate.cancel` vs. `Remate.soft_delete` en el Módulo 2.1).

## Permisos (ver docs/15-modulo-lote.md y docs/16-motor-de-estados.md para el detalle)

- Crear/editar/eliminar/reordenar/abrir/cerrar/cancelar: exclusivamente el rematador
  dueño del remate padre. No hay chequeo de rol explícito acá ni en el router: solo un
  `rematador` puede ser dueño de un remate (se garantiza desde `RemateService.create`),
  así que verificar ownership del remate ya alcanza.
- Ver: dueño y admin ven cualquier lote de cualquier remate propio/todos; cualquier otro
  usuario solo ve lotes de remates que no estén en `DRAFT` — la visibilidad de un lote se
  deriva enteramente de la visibilidad de su remate (`RemateService._is_visible`,
  reutilizada sin cambios vía `get_visible_or_raise`/`get_owned_or_raise`).
- `reserve_price` se oculta (se devuelve `None`) a cualquier viewer que no sea el dueño
  del remate ni un administrador — ver ADR-016.

## Congelamiento de estructura (RF-05/RF-07)

Crear, editar, eliminar y reordenar solo están permitidos mientras el remate padre está
en `DRAFT` o `SCHEDULED` (`_assert_structure_editable`) — una vez `LIVE`, la estructura de
lotes queda congelada, igual que ya aplica `RemateService.update` para el propio remate.
Abrir/cerrar/cancelar, en cambio, son acciones del remate **en curso**: exigen `LIVE`
(abrir) o `LIVE`/`PAUSED` (cerrar, cancelar) — validación completamente separada de
`_assert_structure_editable`, que no se toca.

## Eventos de dominio (Épica 3, Módulo 3.2)

`open`/`open_next`/`close`/`cancel` publican su evento correspondiente
(`app/modules/remates/lotes/events.py`) al final, después de confirmar la transacción —
ver docs/19-arquitectura-de-eventos.md y ADR-022. El CRUD estructural (Módulo 2.2) no
publica nada, mismo criterio que el catálogo de eventos no lo incluye.

## Auditoría (Épica 7, Módulo 7.2)

`create`/`update`/`soft_delete`/`open`/`open_next`/`close`/`cancel` dejan constancia vía
`AuditLogRepository.record` (ver docs/36 y ADR-039), antes del `commit()`/
`_commit_or_raise_conflict()` que ya existen -- misma transacción. `close` distingue
explícitamente `lote.awarded` (venta) de `lote.closed` (no vendido): son dos ítems
separados en el enunciado del módulo.

## Cuenta regresiva y cierre automático (Épica 8, ver docs/40-cuenta-regresiva-y-cierre-automatico.md y ADR-043)

`open`/`open_next` arrancan el timer del lote (`TimerService.start_for_lote`, mutador
puro estático) si el remate configuró `settings.lote_timer_seconds` -- sin cambiar su
comportamiento si no. `close()` se refactorizó en `_apply_close` (mutación + auditoría,
compartida) sin cambiar su firma ni comportamiento externo; `auto_close()` es el nuevo
método que llama `TimerExpiryScheduler` (`app/timer/scheduler.py`) para adjudicar
automáticamente al vencer el timer, reusando `_apply_close` en vez de duplicar la
lógica de cierre.

## Lotes desiertos (Módulo de reincorporación a la cola)

`close()`/`auto_close()`/`cancel()` ya NO llaman a `RemateService.try_auto_finish`
(RF-10/ADR-019 quedan sin efecto): cerrar el último lote deja el remate `LIVE`, nunca lo
finaliza solo -- la única vía de finalización es `POST .../finish`, decidida siempre por
el rematador. `requeue()` es la única forma de salir de `CLOSED_UNSOLD`
(`state_machine.py`): archiva la ronda que termina en `LoteRound` y reincorpora el lote
como `PENDING` al final de la cola actual (`next_display_order`), conservando su
`lot_number`/título/imágenes -- nunca automático, siempre una decisión explícita del
rematador vía `POST .../requeue`.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.events.bus import EventBus
from app.modules.remates.lotes import media_storage
from app.modules.remates.lotes.events import (
    LoteCancelled,
    LoteClosed,
    LoteOpened,
    LoteRequeued,
    LoteWinnerDetermined,
)
from app.modules.remates.lotes.models import Lote, LoteRound, LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.schemas import (
    LoteCloseOutcome,
    LoteCreate,
    LoteRequeueRequest,
    LoteUpdate,
)
from app.modules.remates.lotes.state_machine import assert_transition_allowed
from app.modules.remates.models import Remate, RemateStatus
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.timer.service import TimerService


class LoteService:
    def __init__(
        self,
        repository: LoteRepository,
        remate_service: RemateService,
        event_bus: EventBus,
        settings: Settings,
        audit_repository: AuditLogRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._event_bus = event_bus
        self._settings = settings
        self._audit_repository = audit_repository

    @staticmethod
    def _assert_structure_editable(remate: Remate) -> None:
        if remate.status not in (RemateStatus.DRAFT, RemateStatus.SCHEDULED):
            raise BusinessRuleError(
                "Los lotes solo pueden modificarse mientras el remate está en borrador "
                "o programado.",
                current_status=remate.status.value,
            )

    @staticmethod
    def _mask_reserve_price(lote: Lote, remate: Remate, viewer: User) -> None:
        is_owner = remate.owner_id == viewer.id
        if viewer.role != UserRole.ADMIN and not is_owner:
            lote.reserve_price = None

    async def _get_owned_lote_or_raise(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User
    ) -> tuple[Remate, Lote]:
        """Fase 9 de remediación del WebSocket Security Audit (Auction Business Logic
        Security): usa `get_by_id_for_update` (el mismo `SELECT ... FOR UPDATE` de
        ADR-004 que ya serializa `AuctionEngine.place_bid`/`TimerExpiryScheduler.auto_close`
        contra este lote), no `get_by_id`. Antes de este fix, `open`/`close`/`cancel`/
        `requeue`/`update`/`soft_delete`/`upload_image` leían el lote sin lock: dos
        cierres concurrentes del mismo lote (doble click, reintento de red) podían
        completar los DOS con éxito -- el segundo pisando en silencio el resultado
        (`final_price`/`outcome`) del primero, sin ningún error, pese a que
        `LoteStatus.CLOSED_SOLD`/`CLOSED_UNSOLD` no tienen transiciones salientes
        (`lotes/state_machine.py`) -- y una oferta podía terminar `ACCEPTED` sobre un
        lote que, en términos de negocio, ya se había cerrado (inconsistente con la
        garantía equivalente que sí existe para el cierre automático por timer, ver
        `test_lote_timer.py::test_concurrent_bid_and_scheduler_never_leave_an_inconsistent_state`).
        Con el lock, la segunda llamada concurrente bloquea hasta que la primera
        comitea, y al desbloquearse relee el estado YA actualizado -- `_apply_close`
        entonces rechaza la segunda transición (`assert_transition_allowed` ve
        `CLOSED_SOLD`/`CLOSED_UNSOLD`, no `OPEN`) en vez de aplicarla igual. Ver
        `tests/test_lote_close_concurrency.py`."""
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        lote = await self._repository.get_by_id_for_update(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")
        return remate, lote

    async def create(self, remate_id: uuid.UUID, owner: User, data: LoteCreate) -> Lote:
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        self._assert_structure_editable(remate)

        display_order = await self._repository.next_display_order(remate_id)
        lote = Lote(
            remate_id=remate_id,
            lot_number=data.lot_number,
            display_order=display_order,
            title=data.title,
            description=data.description,
            category=data.category,
            attributes=data.attributes,
            images=[image.model_dump(mode="json") for image in data.images],
            documents=[document.model_dump(mode="json") for document in data.documents],
            quantity=data.quantity,
            unit_label=data.unit_label,
            base_price=data.base_price,
            min_increment=data.min_increment,
            reserve_price=data.reserve_price,
        )
        self._repository.add(lote)
        # `lote.id` es un default client-side -- flush lo asigna sin comitear, para
        # usarlo como resource_id de la entrada de auditoría en el mismo commit único de
        # abajo. Ver docstring del módulo.
        await self._flush_or_raise_conflict(
            f"Ya existe un lote con el número '{data.lot_number}' en este remate."
        )
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.LOTE_CREATED,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={"lot_number": lote.lot_number, "title": lote.title},
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        return lote

    async def get_visible_or_raise(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, viewer: User
    ) -> Lote:
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        lote = await self._repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")
        self._mask_reserve_price(lote, remate, viewer)
        return lote

    async def list_for_viewer(
        self, *, remate_id: uuid.UUID, viewer: User, page: int, page_size: int
    ) -> tuple[list[Lote], int]:
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        offset = (page - 1) * page_size
        items, total = await self._repository.list_by_remate(
            remate_id=remate_id, offset=offset, limit=page_size
        )
        for lote in items:
            self._mask_reserve_price(lote, remate, viewer)
        return items, total

    async def update(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User, data: LoteUpdate
    ) -> Lote:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        self._assert_structure_editable(remate)

        changes = data.model_dump(exclude_unset=True)
        if data.images is not None:
            changes["images"] = [image.model_dump(mode="json") for image in data.images]
        if data.documents is not None:
            changes["documents"] = [
                document.model_dump(mode="json") for document in data.documents
            ]

        base_price: Decimal | None = changes.get("base_price", lote.base_price)
        reserve_price: Decimal | None = changes.get("reserve_price", lote.reserve_price)
        if base_price is not None and reserve_price is not None and reserve_price < base_price:
            raise BusinessRuleError("El precio de reserva no puede ser menor al precio base.")

        for field, value in changes.items():
            setattr(lote, field, value)

        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.LOTE_UPDATED,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={"changed_fields": sorted(changes.keys())},
        )
        await self._commit_or_raise_conflict(
            f"Ya existe un lote con el número '{lote.lot_number}' en este remate."
        )
        await self._repository.refresh(lote)
        return lote

    async def soft_delete(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> None:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        self._assert_structure_editable(remate)
        lote.deleted_at = datetime.now(UTC)
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.LOTE_DELETED,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
        )
        await self._repository.commit()

    async def reorder(
        self, remate_id: uuid.UUID, owner: User, lote_ids: list[uuid.UUID]
    ) -> list[Lote]:
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        self._assert_structure_editable(remate)

        lotes = await self._repository.list_all_by_remate(remate_id)
        lotes_by_id = {lote.id: lote for lote in lotes}
        if len(lote_ids) != len(lotes_by_id) or set(lote_ids) != set(lotes_by_id):
            raise BusinessRuleError(
                "La lista de reordenamiento debe incluir exactamente todos los lotes "
                "vigentes del remate, sin repetidos ni faltantes."
            )

        for index, lote_id in enumerate(lote_ids):
            lotes_by_id[lote_id].display_order = index

        await self._repository.commit()
        # `updated_at` tiene `onupdate=func.now()`: su valor real solo se conoce después
        # del commit, así que cada lote tocado necesita refresh explícito antes de
        # serializarse (mismo motivo que `create`/`update` ya lo hacen) — sin esto, el
        # acceso a `updated_at` durante la serialización de la respuesta dispara un
        # fetch lazy fuera del contexto async correcto (`MissingGreenlet`).
        for lote in lotes_by_id.values():
            await self._repository.refresh(lote)
        return sorted(lotes_by_id.values(), key=lambda lote: lote.display_order)

    async def upload_image(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        owner: User,
        upload: UploadFile,
        request_base_url: str,
    ) -> str:
        """Sube una imagen para un lote propio (Épica 6, Módulo 6.1) -- mismo chequeo de
        ownership y de estructura editable que `create`/`update`/`soft_delete`, para no
        permitir subir contenido a un lote de un remate ajeno o ya congelado. No toca la
        fila del lote: devuelve solo la URL, ver `LoteImageUploadResponse`."""
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        self._assert_structure_editable(remate)
        return await media_storage.save_lote_image(lote.id, upload, self._settings, request_base_url)

    # --- Motor de estados (Módulo 2.3, ver docs/16-motor-de-estados.md) --------------

    async def _assert_can_open(self, remate: Remate) -> None:
        if remate.status != RemateStatus.LIVE:
            raise BusinessRuleError(
                "Solo se puede abrir un lote mientras el remate está en curso (LIVE).",
                current_status=remate.status.value,
            )
        if await self._repository.has_open_lote(remate.id):
            raise BusinessRuleError(
                "Ya hay un lote abierto en este remate; hay que cerrarlo o cancelarlo "
                "antes de abrir otro (RF-12)."
            )

    async def open(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> Lote:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        await self._assert_can_open(remate)
        assert_transition_allowed(lote.status, LoteStatus.OPEN)

        lote.status = LoteStatus.OPEN
        lote.opened_at = datetime.now(UTC)
        # Cuenta regresiva (Épica 8, ADR-043): mutación en memoria sobre el mismo
        # `lote`, sin commit propio -- el `commit()` de acá abajo (ya existente) la
        # persiste junto con la apertura. `None` si el remate no configuró
        # `settings.lote_timer_seconds` -- comportamiento intacto.
        timer_started = TimerService.start_for_lote(lote, remate)
        self._record_lote_action(lote, owner, remate_id, AuditAction.LOTE_OPENED)
        await self._commit_or_raise_conflict(
            "Ya hay un lote abierto en este remate (conflicto de concurrencia)."
        )
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteOpened(
                remate_id=remate.id,
                lote_id=lote.id,
                lot_number=lote.lot_number,
                display_order=lote.display_order,
            )
        )
        if timer_started is not None:
            await self._event_bus.publish(timer_started)
        return lote

    async def open_next(self, remate_id: uuid.UUID, owner: User) -> Lote:
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        await self._assert_can_open(remate)

        lote = await self._repository.get_next_pending_lote(remate_id)
        if lote is None:
            raise BusinessRuleError("No quedan lotes pendientes por abrir en este remate.")

        lote.status = LoteStatus.OPEN
        lote.opened_at = datetime.now(UTC)
        timer_started = TimerService.start_for_lote(lote, remate)
        self._record_lote_action(lote, owner, remate_id, AuditAction.LOTE_OPENED)
        await self._commit_or_raise_conflict(
            "Ya hay un lote abierto en este remate (conflicto de concurrencia)."
        )
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteOpened(
                remate_id=remate.id,
                lote_id=lote.id,
                lot_number=lote.lot_number,
                display_order=lote.display_order,
            )
        )
        if timer_started is not None:
            await self._event_bus.publish(timer_started)
        return lote

    async def close(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        owner: User,
        outcome: LoteCloseOutcome,
        final_price: Decimal | None,
    ) -> Lote:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        if remate.status not in (RemateStatus.LIVE, RemateStatus.PAUSED):
            raise BusinessRuleError(
                "Solo se puede cerrar un lote mientras el remate está en curso o "
                "pausado.",
                current_status=remate.status.value,
            )

        self._apply_close(
            lote,
            remate_id,
            outcome,
            final_price,
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            trigger="manual",
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteClosed(
                remate_id=remate.id,
                lote_id=lote.id,
                outcome=outcome.value,
                final_price=final_price,
                triggered_by="manual",
            )
        )
        return lote

    def _apply_close(
        self,
        lote: Lote,
        remate_id: uuid.UUID,
        outcome: LoteCloseOutcome,
        final_price: Decimal | None,
        *,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
        actor_role: str | None,
        trigger: str,
    ) -> None:
        """Mutación + auditoría compartidas entre `close()` (manual, con dueño) y
        `auto_close()` (Épica 8, sistema -- ver docstring del módulo) -- sin commit ni
        publish, cada caller hace lo suyo después, igual que el resto del módulo."""
        target = (
            LoteStatus.CLOSED_SOLD if outcome == LoteCloseOutcome.SOLD else LoteStatus.CLOSED_UNSOLD
        )
        assert_transition_allowed(lote.status, target)

        if outcome == LoteCloseOutcome.SOLD and final_price < lote.base_price:
            raise BusinessRuleError("El precio final no puede ser menor al precio base.")

        lote.status = target
        lote.final_price = final_price
        lote.closed_at = datetime.now(UTC)
        # Cuenta regresiva (Épica 8, ADR-043): un cierre (manual o automático) siempre
        # termina cualquier timer en curso -- un lote cerrado no tiene countdown.
        lote.timer_ends_at = None
        lote.timer_paused_remaining_seconds = None
        # Ítems distintos del enunciado: `lote.awarded` cuando se vende (adjudicación),
        # `lote.closed` cuando no -- ver docstring del módulo.
        audit_action = AuditAction.LOTE_AWARDED if outcome == LoteCloseOutcome.SOLD else AuditAction.LOTE_CLOSED
        self._audit_repository.record(
            actor_id=actor_id,
            actor_name=actor_name,
            actor_role=actor_role,
            action=audit_action,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={
                "outcome": outcome.value,
                "final_price": str(final_price) if final_price is not None else None,
                "trigger": trigger,
            },
        )

    async def auto_close(
        self,
        lote: Lote,
        remate: Remate,
        *,
        leading_oferta_id: uuid.UUID | None,
        leading_buyer_id: uuid.UUID | None,
        leading_amount: Decimal | None,
    ) -> Lote:
        """Adjudicación automática al vencer el timer (Épica 8, "cuenta regresiva y
        cierre automático", ADR-043) -- llamado únicamente por
        `app/timer/scheduler.py::TimerExpiryScheduler`, que ya tiene `lote`/`remate`
        cargados y bloqueados (`LoteRepository.get_by_id_for_update`, ADR-004) en su
        propia sesión: acá no se vuelve a bloquear ni a chequear ownership (no hay un
        `owner` humano) -- son las mismas primitivas de `_apply_close` que ya usa el
        cierre manual, sin duplicar esa lógica.

        `SOLD` con el monto de la oferta líder si existe, `UNSOLD` si el lote no tuvo
        ninguna oferta aceptada -- misma validación `final_price >= base_price` que ya
        aplica `close()`, ninguna regla nueva. Sin actor (`actor_id=None`): la
        transición la dispara el sistema (`TimerExpiryScheduler`), no un caller HTTP."""
        outcome = LoteCloseOutcome.SOLD if leading_oferta_id is not None else LoteCloseOutcome.UNSOLD
        final_price = leading_amount if outcome == LoteCloseOutcome.SOLD else None

        self._apply_close(
            lote,
            remate.id,
            outcome,
            final_price,
            actor_id=None,
            actor_name=None,
            actor_role=None,
            trigger="auto",
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteClosed(
                remate_id=remate.id,
                lote_id=lote.id,
                outcome=outcome.value,
                final_price=final_price,
                triggered_by="auto",
            )
        )
        if outcome == LoteCloseOutcome.SOLD:
            assert leading_oferta_id is not None
            assert leading_buyer_id is not None
            assert leading_amount is not None
            await self._event_bus.publish(
                LoteWinnerDetermined(
                    remate_id=remate.id,
                    lote_id=lote.id,
                    oferta_id=leading_oferta_id,
                    buyer_id=leading_buyer_id,
                    amount=leading_amount,
                )
            )
        return lote

    async def cancel(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User, reason: str
    ) -> Lote:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        if remate.status not in (RemateStatus.LIVE, RemateStatus.PAUSED):
            raise BusinessRuleError(
                "Solo se puede cancelar un lote mientras el remate está en curso o "
                "pausado.",
                current_status=remate.status.value,
            )
        assert_transition_allowed(lote.status, LoteStatus.CANCELLED)

        lote.status = LoteStatus.CANCELLED
        lote.cancellation_reason = reason
        lote.cancelled_at = datetime.now(UTC)
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.LOTE_CANCELLED,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={"reason": reason},
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteCancelled(remate_id=remate.id, lote_id=lote.id, reason=reason)
        )
        return lote

    # --- Lotes desiertos: reincorporación a la cola (ver docs/16-motor-de-estados.md) --

    async def requeue(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        owner: User,
        data: LoteRequeueRequest,
    ) -> Lote:
        """Reincorpora un lote `closed_unsold` a la cola de pendientes -- la decisión es
        siempre del rematador (nunca automática, ver `state_machine.py`). Archiva la
        ronda que acaba de terminar en `LoteRound` (snapshot de las condiciones
        comerciales vigentes en ella) antes de resetear el lote, aplica condiciones
        nuevas si el rematador las edita (o conserva las de la ronda anterior si no) y
        lo manda al final de la cola reusando `next_display_order` -- el mismo mecanismo
        que ya usa `create` para asignar posición, así que nunca puede "colarse" antes
        de un lote todavía no abierto."""
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        if remate.status not in (RemateStatus.LIVE, RemateStatus.PAUSED):
            raise BusinessRuleError(
                "Solo se puede reincorporar un lote mientras el remate está en curso o "
                "pausado.",
                current_status=remate.status.value,
            )
        assert_transition_allowed(lote.status, LoteStatus.PENDING)
        assert lote.closed_at is not None  # invariante: todo CLOSED_UNSOLD tiene closed_at

        self._repository.add_round(
            LoteRound(
                lote_id=lote.id,
                round_number=lote.round_number,
                base_price=lote.base_price,
                min_increment=lote.min_increment,
                reserve_price=lote.reserve_price,
                opened_at=lote.opened_at,
                closed_at=lote.closed_at,
                requeued_at=datetime.now(UTC),
                requeued_by_id=owner.id,
                requeued_by_name=owner.full_name,
            )
        )

        changes = data.model_dump(exclude_unset=True)
        new_base_price: Decimal = changes.get("base_price", lote.base_price)
        new_reserve_price: Decimal | None = changes.get("reserve_price", lote.reserve_price)
        if new_reserve_price is not None and new_reserve_price < new_base_price:
            raise BusinessRuleError("El precio de reserva no puede ser menor al precio base.")
        for field, value in changes.items():
            setattr(lote, field, value)

        previous_round = lote.round_number
        lote.status = LoteStatus.PENDING
        lote.final_price = None
        lote.opened_at = None
        lote.closed_at = None
        lote.display_order = await self._repository.next_display_order(remate_id)
        lote.round_number += 1

        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.LOTE_REQUEUED,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={
                "previous_round": previous_round,
                "new_round": lote.round_number,
                "new_display_order": lote.display_order,
                "conditions_changed": bool(changes),
            },
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteRequeued(
                remate_id=remate.id,
                lote_id=lote.id,
                lot_number=lote.lot_number,
                display_order=lote.display_order,
                round_number=lote.round_number,
                base_price=lote.base_price,
                min_increment=lote.min_increment,
                reserve_price=lote.reserve_price,
            )
        )
        return lote

    async def list_rounds(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, viewer: User
    ) -> list[LoteRound]:
        """Historial de rondas desiertas archivadas de un lote (`GET .../rounds`) --
        misma visibilidad que el lote (`get_visible_or_raise`) y mismo enmascarado de
        `reserve_price` que `LoteRead` para un viewer que no es dueño ni admin."""
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        lote = await self._repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        rounds = await self._repository.list_rounds_by_lote(lote_id)
        if remate.owner_id != viewer.id and viewer.role != UserRole.ADMIN:
            for round_ in rounds:
                round_.reserve_price = None
        return rounds

    def _record_lote_action(self, lote: Lote, owner: User, remate_id: uuid.UUID, action: str) -> None:
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=action,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details={"lot_number": lote.lot_number},
        )

    async def _flush_or_raise_conflict(self, message: str) -> None:
        try:
            await self._audit_repository.flush()
        except IntegrityError as exc:
            await self._repository.rollback()
            raise ConflictError(message) from exc

    async def _commit_or_raise_conflict(self, message: str) -> None:
        try:
            await self._repository.commit()
        except IntegrityError as exc:
            await self._repository.rollback()
            raise ConflictError(message) from exc
