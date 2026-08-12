"""Lógica de negocio de Remate.

## Alcance (Módulo 2.1 + Módulo 2.3)

Transiciones de estado implementadas: `create` (-> DRAFT), `schedule` (DRAFT ->
SCHEDULED), `cancel` (cualquier estado no terminal -> CANCELLED) desde el Módulo 2.1;
`start` (SCHEDULED -> LIVE, valida RF-08), `pause`/`resume` (LIVE <-> PAUSED) y `finish`
(LIVE -> FINISHED, valida que no haya un lote OPEN) desde el Módulo 2.3 — ver
docs/16-motor-de-estados.md. `state_machine.py` no cambió: ya modelaba las seis
transiciones completas desde el Módulo 2.1, este módulo solo agregó los métodos de
servicio que faltaban, tal como esa fase anticipaba.

`finish` es, desde el Módulo de lotes desiertos, la ÚNICA vía de finalización: ya no
existe ninguna finalización automática al resolverse el último lote (RF-10/ADR-019
quedan sin efecto, ver `app/modules/remates/lotes/service.py`) -- el rematador decide
siempre explícitamente cuándo terminar, incluso con lotes desiertos pendientes de
reincorporar.

## Eventos de dominio (Épica 3, Módulo 3.2)

Cada transición publica su evento correspondiente (`app/modules/remates/events.py`) a
través de `EventBus`, siempre como última instrucción, después de confirmar la
transacción — ver docs/19-arquitectura-de-eventos.md y ADR-022. Es el único cambio de
esta fase: ninguna validación ni regla de negocio de las descriptas arriba se modificó.

## Auditoría (Épica 7, Módulo 7.2)

`create`, `update` (`remate.updated`/`remate.settings_changed` según si `settings`
cambió), `soft_delete` y las seis transiciones de estado (`remate.status_changed`)
dejan constancia vía `AuditLogRepository.record` (ver docs/36 y ADR-039), **antes** del
`commit()` que ya existe en cada método -- misma transacción, nunca vía el Event Bus
(best-effort, podría perderse).

## Permisos (ver docs/14-modulo-remate.md para el detalle completo)

- Crear: solo rol `rematador` (aplicado en el router vía `require_roles`).
- Ver: dueño y admin ven cualquier estado; cualquier otro usuario solo ve remates que no
  estén en `DRAFT`. Un borrador ajeno devuelve 404, no 403 — no se confirma su
  existencia a quien no debería ni saber que existe.
- Modificar/programar/cancelar/eliminar/iniciar/pausar/reanudar/finalizar: exclusivamente
  el rematador dueño. El admin puede *ver* todo pero no puede escribir — así lo pide el
  enunciado de este módulo.
"""

import uuid
from datetime import UTC, datetime

from fastapi import UploadFile

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.events.bus import EventBus
from app.modules.remates import media_storage
from app.modules.remates.events import (
    RemateCancelled,
    RemateCreated,
    RemateFinished,
    RematePaused,
    RemateResumed,
    RemateScheduled,
    RemateStarted,
)
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.repository import RemateRepository
from app.modules.remates.schemas import RemateCreate, RemateUpdate
from app.modules.remates.state_machine import assert_transition_allowed
from app.modules.users.models import User, UserRole


class RemateService:
    def __init__(
        self,
        repository: RemateRepository,
        lote_repository: LoteRepository,
        event_bus: EventBus,
        audit_repository: AuditLogRepository,
    ) -> None:
        self._repository = repository
        self._lote_repository = lote_repository
        self._event_bus = event_bus
        self._audit_repository = audit_repository

    def _record_status_change(
        self, remate: Remate, actor: User | None, previous_status: RemateStatus, *, trigger: str
    ) -> None:
        self._audit_repository.record(
            actor_id=actor.id if actor else None,
            actor_name=actor.full_name if actor else None,
            actor_role=actor.role.value if actor else None,
            action=AuditAction.REMATE_STATUS_CHANGED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"from": previous_status.value, "to": remate.status.value, "trigger": trigger},
        )

    async def create(self, owner: User, data: RemateCreate) -> Remate:
        remate = Remate(
            owner_id=owner.id,
            title=data.title,
            category=data.category,
            description=data.description,
            cover_image_url=str(data.cover_image_url) if data.cover_image_url else None,
            location=data.location,
            starts_at=data.starts_at,
            ends_at=data.ends_at,
            settings=data.settings.model_dump(),
        )
        self._repository.add(remate)
        # `remate.id` es un default client-side (`uuid.uuid4`, ver `db/mixins.py`) --
        # flush lo asigna sin comitear, para poder usarlo como resource_id/remate_id de
        # la entrada de auditoría y dejarla en el mismo commit único de abajo.
        await self._audit_repository.flush()
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_CREATED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"title": remate.title, "category": remate.category.value},
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(
            RemateCreated(
                remate_id=remate.id,
                owner_id=remate.owner_id,
                title=remate.title,
                category=remate.category,
            )
        )
        return remate

    async def upload_cover_image(
        self, owner: User, upload: UploadFile, settings: Settings, request_base_url: str
    ) -> str:
        """Sube la imagen de portada de un remate (refinamiento visual: reemplaza el
        campo de URL manual por selección de archivo, `RemateFormModal`). Sin scope a
        un `remate_id` -- se llama desde el mismo formulario que crea el remate, antes
        de que exista ninguna fila (`media_storage.save_remate_cover_image` namespacea
        por `owner_id`, no por `remate_id`, justamente por esto). No hay ownership de un
        remate puntual que validar acá; el único control de acceso es el rol
        `rematador`, ya exigido por `require_roles` en el router. No toca ninguna fila:
        devuelve solo la URL, igual que `LoteService.upload_image`."""
        return await media_storage.save_remate_cover_image(
            owner.id, upload, settings, request_base_url
        )

    @staticmethod
    def _is_visible(remate: Remate, viewer: User) -> bool:
        if viewer.role == UserRole.ADMIN:
            return True
        if remate.owner_id == viewer.id:
            return True
        return remate.status != RemateStatus.DRAFT

    async def get_visible_or_raise(self, remate_id: uuid.UUID, viewer: User) -> Remate:
        remate = await self._repository.get_by_id(remate_id)
        if remate is None or not self._is_visible(remate, viewer):
            raise NotFoundError("Remate no encontrado.")
        return remate

    async def get_owned_or_raise(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_visible_or_raise(remate_id, owner)
        if remate.owner_id != owner.id:
            raise ForbiddenError("Solo el propietario puede modificar este remate.")
        return remate

    async def list_for_viewer(
        self,
        *,
        viewer: User,
        page: int,
        page_size: int,
        category: RemateCategory | None = None,
        status: RemateStatus | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> tuple[list[Remate], int]:
        offset = (page - 1) * page_size
        return await self._repository.list_for_viewer(
            viewer=viewer,
            offset=offset,
            limit=page_size,
            category=category,
            status=status,
            owner_id=owner_id,
        )

    async def update(self, remate_id: uuid.UUID, owner: User, data: RemateUpdate) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        if remate.status not in (RemateStatus.DRAFT, RemateStatus.SCHEDULED):
            raise BusinessRuleError(
                "Solo se puede editar un remate en borrador o programado.",
                current_status=remate.status.value,
            )

        changes = data.model_dump(exclude_unset=True)
        if changes.get("cover_image_url") is not None:
            changes["cover_image_url"] = str(changes["cover_image_url"])

        starts_at = changes.get("starts_at", remate.starts_at)
        ends_at = changes.get("ends_at", remate.ends_at)
        if starts_at and ends_at and ends_at <= starts_at:
            raise BusinessRuleError("La fecha de finalización debe ser posterior a la de inicio.")

        for field, value in changes.items():
            setattr(remate, field, value)

        audit_action = (
            AuditAction.REMATE_SETTINGS_CHANGED
            if "settings" in changes
            else AuditAction.REMATE_UPDATED
        )
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=audit_action,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"changed_fields": sorted(changes.keys())},
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

    async def schedule(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.SCHEDULED)
        previous_status = remate.status

        if remate.starts_at is None:
            raise BusinessRuleError(
                "Para programar el remate hace falta definir la fecha y hora de inicio."
            )
        if remate.starts_at <= datetime.now(UTC):
            raise BusinessRuleError("La fecha de inicio debe ser futura.")

        remate.status = RemateStatus.SCHEDULED
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(
            RemateScheduled(remate_id=remate.id, starts_at=remate.starts_at)
        )
        return remate

    async def cancel(self, remate_id: uuid.UUID, owner: User, reason: str) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.CANCELLED)
        previous_status = remate.status

        remate.status = RemateStatus.CANCELLED
        remate.cancellation_reason = reason
        remate.cancelled_at = datetime.now(UTC)

        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_STATUS_CHANGED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={
                "from": previous_status.value,
                "to": remate.status.value,
                "trigger": "manual",
                "reason": reason,
            },
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateCancelled(remate_id=remate.id, reason=reason))
        return remate

    async def soft_delete(self, remate_id: uuid.UUID, owner: User) -> None:
        remate = await self.get_owned_or_raise(remate_id, owner)
        if remate.status != RemateStatus.DRAFT:
            raise BusinessRuleError(
                "Solo se puede eliminar un remate en borrador; para uno programado o "
                "posterior, cancelalo (conserva el motivo para auditoría).",
                current_status=remate.status.value,
            )
        remate.deleted_at = datetime.now(UTC)
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_DELETED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
        )
        await self._repository.commit()

    async def start(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.LIVE)
        previous_status = remate.status

        if await self._lote_repository.count_by_remate(remate_id) == 0:
            raise BusinessRuleError(
                "Un remate no puede iniciarse sin al menos un lote cargado (RF-08)."
            )

        remate.status = RemateStatus.LIVE
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateStarted(remate_id=remate.id))
        return remate

    async def pause(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.PAUSED)
        previous_status = remate.status

        remate.status = RemateStatus.PAUSED
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RematePaused(remate_id=remate.id))
        return remate

    async def resume(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.LIVE)
        previous_status = remate.status

        remate.status = RemateStatus.LIVE
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateResumed(remate_id=remate.id))
        return remate

    async def finish(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.FINISHED)
        previous_status = remate.status

        if await self._lote_repository.has_open_lote(remate_id):
            raise BusinessRuleError(
                "No se puede finalizar el remate mientras haya un lote abierto."
            )

        remate.status = RemateStatus.FINISHED
        remate.finished_at = datetime.now(UTC)
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateFinished(remate_id=remate.id, triggered_by="manual"))
        return remate
