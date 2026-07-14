"""Endpoints del recurso `Remate`.

`POST /` exige rol `rematador` (nadie más puede crear un remate). El resto de los
endpoints no filtra por rol sino por *ownership*: un rematador que no es dueño de un
remate se trata igual que un comprador frente a ese remate puntual (ver
`RemateService._is_visible` / `get_owned_or_raise`). Por eso no hay `require_roles` en
`GET`, `PATCH`, `schedule`, `cancel` ni `DELETE` — la regla no es "qué rol tenés" sino
"sos el dueño de este remate en particular", y esa regla la aplica el servicio, no el
router.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.common.schemas import Page
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.schemas import (
    RemateCancelRequest,
    RemateCreate,
    RemateRead,
    RemateUpdate,
)
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

router = APIRouter()


@router.post(
    "",
    response_model=RemateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.REMATADOR))],
    summary="Crear un remate en borrador (RF-04)",
)
async def create_remate(
    data: RemateCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.create(current_user, data)


@router.get(
    "",
    response_model=Page[RemateRead],
    summary="Listar remates visibles para el usuario actual",
)
async def list_remates(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category: RemateCategory | None = None,
    status_: RemateStatus | None = Query(default=None, alias="status"),  # noqa: B008
    owner_id: uuid.UUID | None = None,
) -> Page[RemateRead]:
    items, total = await service.list_for_viewer(
        viewer=current_user,
        page=page,
        page_size=page_size,
        category=category,
        status=status_,
        owner_id=owner_id,
    )
    return Page[RemateRead](items=list(items), total=total, page=page, page_size=page_size)


@router.get(
    "/{remate_id}",
    response_model=RemateRead,
    summary="Detalle de un remate (404 si no es visible para el usuario actual)",
)
async def get_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.get_visible_or_raise(remate_id, current_user)


@router.patch(
    "/{remate_id}",
    response_model=RemateRead,
    summary="Editar un remate propio (solo en borrador o programado, RF-05)",
)
async def update_remate(
    remate_id: uuid.UUID,
    data: RemateUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.update(remate_id, current_user, data)


@router.post(
    "/{remate_id}/schedule",
    response_model=RemateRead,
    summary="Programar un remate propio (DRAFT -> SCHEDULED)",
)
async def schedule_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.schedule(remate_id, current_user)


@router.post(
    "/{remate_id}/cancel",
    response_model=RemateRead,
    summary="Cancelar un remate propio, con motivo obligatorio (RF-11)",
)
async def cancel_remate(
    remate_id: uuid.UUID,
    data: RemateCancelRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.cancel(remate_id, current_user, data.reason)


@router.delete(
    "/{remate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar (soft delete) un remate propio en borrador",
)
async def delete_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> None:
    await service.soft_delete(remate_id, current_user)
