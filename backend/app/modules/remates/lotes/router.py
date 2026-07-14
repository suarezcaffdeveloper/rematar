"""Endpoints del recurso `Lote`, anidados bajo `/remates/{remate_id}/lotes` (montado en
`app/modules/remates/router.py`).

Ningún endpoint acá tiene `require_roles`: la autorización de escritura pasa por
ownership del remate padre (`LoteService` llama a `RemateService.get_owned_or_raise`), y
solo un `rematador` puede ser dueño de un remate — ver docs/15-modulo-lote.md.

El endpoint `/reorder` se declara antes de `/{lote_id}` para que Starlette no intente
matchear "reorder" como un `lote_id` (los path operations se resuelven en el orden en que
se registran).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.common.schemas import Page
from app.modules.auth.dependencies import get_current_user
from app.modules.remates.lotes.dependencies import get_lote_service
from app.modules.remates.lotes.models import Lote
from app.modules.remates.lotes.schemas import LoteCreate, LoteRead, LoteReorderRequest, LoteUpdate
from app.modules.remates.lotes.service import LoteService
from app.modules.users.models import User

router = APIRouter()


@router.post(
    "",
    response_model=LoteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un lote en un remate propio (RF-06)",
)
async def create_lote(
    remate_id: uuid.UUID,
    data: LoteCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
) -> Lote:
    return await service.create(remate_id, current_user, data)


@router.get(
    "",
    response_model=Page[LoteRead],
    summary="Listar lotes de un remate visible para el usuario actual",
)
async def list_lotes(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[LoteRead]:
    items, total = await service.list_for_viewer(
        remate_id=remate_id, viewer=current_user, page=page, page_size=page_size
    )
    return Page[LoteRead](items=list(items), total=total, page=page, page_size=page_size)


@router.post(
    "/reorder",
    response_model=list[LoteRead],
    summary="Reordenar los lotes de un remate propio (RF-07)",
)
async def reorder_lotes(
    remate_id: uuid.UUID,
    data: LoteReorderRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
) -> list[Lote]:
    return await service.reorder(remate_id, current_user, data.lote_ids)


@router.get(
    "/{lote_id}",
    response_model=LoteRead,
    summary="Detalle de un lote (404 si no es visible para el usuario actual)",
)
async def get_lote(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
) -> Lote:
    return await service.get_visible_or_raise(remate_id, lote_id, current_user)


@router.patch(
    "/{lote_id}",
    response_model=LoteRead,
    summary="Editar un lote propio (solo mientras el remate no está LIVE, RF-05/RF-07)",
)
async def update_lote(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    data: LoteUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
) -> Lote:
    return await service.update(remate_id, lote_id, current_user, data)


@router.delete(
    "/{lote_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar (soft delete) un lote propio",
)
async def delete_lote(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[LoteService, Depends(get_lote_service)],
) -> None:
    await service.soft_delete(remate_id, lote_id, current_user)
