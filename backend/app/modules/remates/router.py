"""Endpoints del recurso `Remate`.

`POST /` exige rol `rematador` (nadie más puede crear un remate). El resto de los
endpoints no filtra por rol sino por *ownership*: un rematador que no es dueño de un
remate se trata igual que un comprador frente a ese remate puntual (ver
`RemateService._is_visible` / `get_owned_or_raise`). Por eso no hay `require_roles` en
`GET`, `PATCH`, `schedule`, `cancel`, `start`, `pause`, `resume`, `finish` ni `DELETE` —
la regla no es "qué rol tenés" sino "sos el dueño de este remate en particular", y esa
regla la aplica el servicio, no el router.

`start`/`pause`/`resume`/`finish` son del motor de estados (Épica 2, Módulo 2.3, ver
docs/16-motor-de-estados.md); no llevan lógica propia acá, cada uno delega enteramente
en el método homónimo de `RemateService`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status

from app.common.schemas import Page
from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.router import router as lotes_router
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.schemas import (
    RemateCancelRequest,
    RemateCoverImageUploadResponse,
    RemateCreate,
    RemateRead,
    RemateUpdate,
)
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

router = APIRouter()

# Lote (Épica 2, Módulo 2.2) cuelga siempre de un remate — ver docs/15-modulo-lote.md
# sobre por qué vive en un sub-paquete de `remates` en vez de un módulo nuevo.
router.include_router(lotes_router, prefix="/{remate_id}/lotes", tags=["lotes"])


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


@router.post(
    "/cover-image",
    response_model=RemateCoverImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.REMATADOR))],
    summary="Subir la imagen de portada de un remate (refinamiento visual, item 6)",
)
async def upload_remate_cover_image(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
) -> RemateCoverImageUploadResponse:
    # Sin `{remate_id}` en el path a propósito: se llama desde el mismo formulario que
    # crea el remate (`RemateFormModal`), antes de que exista ningún remate al que
    # asociar la imagen -- ver `RemateService.upload_cover_image`.
    url = await service.upload_cover_image(current_user, file, settings, str(request.base_url))
    return RemateCoverImageUploadResponse(url=url)


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


@router.post(
    "/{remate_id}/start",
    response_model=RemateRead,
    summary="Iniciar un remate propio (SCHEDULED -> LIVE, exige al menos un lote, RF-08)",
)
async def start_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.start(remate_id, current_user)


@router.post(
    "/{remate_id}/pause",
    response_model=RemateRead,
    summary="Pausar un remate propio en curso (LIVE -> PAUSED)",
)
async def pause_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.pause(remate_id, current_user)


@router.post(
    "/{remate_id}/resume",
    response_model=RemateRead,
    summary="Reanudar un remate propio pausado (PAUSED -> LIVE)",
)
async def resume_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.resume(remate_id, current_user)


@router.post(
    "/{remate_id}/finish",
    response_model=RemateRead,
    summary="Finalizar un remate propio (LIVE -> FINISHED, exige que no haya un lote abierto)",
)
async def finish_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.finish(remate_id, current_user)


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
