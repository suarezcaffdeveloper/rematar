"""Lógica de negocio de Lote.

## Alcance de esta fase (Módulo 2.2)

CRUD completo (`create`, `update`, `soft_delete`, `reorder`) más lectura con visibilidad
(`get_visible_or_raise`, `list_for_viewer`). Deliberadamente NO se implementa ninguna
transición de estado (abrir/cerrar/cancelar un lote): todo lote se crea en `PENDING` y
`lotes/state_machine.py` no se invoca desde ningún lado todavía — queda para el módulo de
Ofertas (ver docs/15-modulo-lote.md).

## Permisos (ver docs/15-modulo-lote.md para el detalle completo)

- Crear/editar/eliminar/reordenar: exclusivamente el rematador dueño del remate padre. No
  hay chequeo de rol explícito acá ni en el router: solo un `rematador` puede ser dueño de
  un remate (se garantiza desde `RemateService.create`), así que verificar ownership del
  remate ya alcanza.
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
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.modules.remates.lotes.models import Lote
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.schemas import LoteCreate, LoteUpdate
from app.modules.remates.models import Remate, RemateStatus
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole


class LoteService:
    def __init__(self, repository: LoteRepository, remate_service: RemateService) -> None:
        self._repository = repository
        self._remate_service = remate_service

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
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        lote = await self._repository.get_by_id(lote_id)
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
        await self._commit_or_raise_conflict(data.lot_number)
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

        await self._commit_or_raise_conflict(lote.lot_number)
        await self._repository.refresh(lote)
        return lote

    async def soft_delete(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> None:
        remate, lote = await self._get_owned_lote_or_raise(remate_id, lote_id, owner)
        self._assert_structure_editable(remate)
        lote.deleted_at = datetime.now(UTC)
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

    async def _commit_or_raise_conflict(self, lot_number: str) -> None:
        try:
            await self._repository.commit()
        except IntegrityError as exc:
            await self._repository.rollback()
            raise ConflictError(
                f"Ya existe un lote con el número '{lot_number}' en este remate."
            ) from exc
