"""Lógica de negocio de Remate.

## Alcance de esta fase (Módulo 2.1)

Transiciones de estado implementadas: `create` (-> DRAFT), `schedule` (DRAFT ->
SCHEDULED) y `cancel` (cualquier estado no terminal -> CANCELLED). Deliberadamente NO
se implementan `start` (-> LIVE), `pause`/`resume` (<-> PAUSED) ni `finish` (->
FINISHED): RF-08 (docs/03-requisitos-funcionales.md) exige que un remate solo pueda
iniciarse si tiene al menos un lote cargado, y este módulo explícitamente no incluye
Lotes todavía (instrucción del usuario). Exponer "iniciar remate" sin poder validar esa
precondición sería implementar la mitad de una regla de negocio — mejor no exponerla
que exponerla mal. `state_machine.py` ya modela las seis transiciones completas para que
el módulo que agregue Lotes solo tenga que agregar los métodos de servicio que faltan,
no rediseñar la máquina de estados.

## Permisos (ver docs/14-modulo-remate.md para el detalle completo)

- Crear: solo rol `rematador` (aplicado en el router vía `require_roles`).
- Ver: dueño y admin ven cualquier estado; cualquier otro usuario solo ve remates que no
  estén en `DRAFT`. Un borrador ajeno devuelve 404, no 403 — no se confirma su
  existencia a quien no debería ni saber que existe.
- Modificar/programar/cancelar/eliminar: exclusivamente el rematador dueño. El admin
  puede *ver* todo pero no puede escribir — así lo pide el enunciado de este módulo.
"""

import uuid
from datetime import UTC, datetime

from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.repository import RemateRepository
from app.modules.remates.schemas import RemateCreate, RemateUpdate
from app.modules.remates.state_machine import assert_transition_allowed
from app.modules.users.models import User, UserRole


class RemateService:
    def __init__(self, repository: RemateRepository) -> None:
        self._repository = repository

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
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

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

        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

    async def schedule(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.SCHEDULED)

        if remate.starts_at is None:
            raise BusinessRuleError(
                "Para programar el remate hace falta definir la fecha y hora de inicio."
            )
        if remate.starts_at <= datetime.now(UTC):
            raise BusinessRuleError("La fecha de inicio debe ser futura.")

        remate.status = RemateStatus.SCHEDULED
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

    async def cancel(self, remate_id: uuid.UUID, owner: User, reason: str) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.CANCELLED)

        remate.status = RemateStatus.CANCELLED
        remate.cancellation_reason = reason
        remate.cancelled_at = datetime.now(UTC)

        await self._repository.commit()
        await self._repository.refresh(remate)
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
        await self._repository.commit()
