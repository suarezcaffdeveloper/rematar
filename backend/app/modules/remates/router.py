"""Endpoints del recurso `Remate`.

`POST /` exige rol `empresa` (nadie más puede crear un remate — ver ADR-047: `empresa`
es el dueño comercial del remate, `rematador` quedó acotado a operar en vivo el remate
que una empresa le asignó por código). El resto de los endpoints no filtra por rol sino
por *ownership*: una empresa que no es dueña de un remate se trata igual que un
comprador frente a ese remate puntual (ver `RemateService._is_visible` /
`get_owned_or_raise`). Por eso no hay `require_roles` en `GET`, `PATCH`, `schedule`,
`cancel`, `start`, `pause`, `resume`, `finish` ni `DELETE` — la regla no es "qué rol
tenés" sino "sos el dueño (o, para pause/resume/finish, también el operador asignado) de
este remate en particular", y esa regla la aplica el servicio, no el router.

`start`/`pause`/`resume`/`finish` son del motor de estados (Épica 2, Módulo 2.3, ver
docs/16-motor-de-estados.md); no llevan lógica propia acá, cada uno delega enteramente
en el método homónimo de `RemateService`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status

from app.common.schemas import Page
from app.core.config import Settings, get_settings
from app.core.exceptions import NotFoundError
from app.modules.auth.dependencies import get_current_user, get_current_user_optional, require_roles
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.router import router as lotes_router
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.schemas import (
    RemateCancelRequest,
    RemateCoverImageUploadResponse,
    RemateCreate,
    RemateCreateResponse,
    RemateOperatorClaimRequest,
    RemateOperatorCodeResponse,
    RematePrivateAccessCodeResponse,
    RematePrivateAccessRedeemRequest,
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
    response_model=RemateCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.EMPRESA))],
    summary="Crear un remate en borrador (RF-04)",
)
async def create_remate(
    data: RemateCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> RemateCreateResponse:
    remate, code = await service.create(current_user, data)
    return RemateCreateResponse(
        **RemateRead.model_validate(remate).model_dump(), private_access_code=code
    )


@router.post(
    "/cover-image",
    response_model=RemateCoverImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.EMPRESA))],
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
    summary="Listar remates visibles para el usuario actual (o para un visitante anónimo, ADR-049)",
)
async def list_remates(
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
    service: Annotated[RemateService, Depends(get_remate_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category: RemateCategory | None = None,
    status_: RemateStatus | None = Query(default=None, alias="status"),  # noqa: B008
    owner_id: uuid.UUID | None = None,
    rematador_id: uuid.UUID | None = None,
) -> Page[RemateRead]:
    items, total = await service.list_for_viewer(
        viewer=current_user,
        page=page,
        page_size=page_size,
        category=category,
        status=status_,
        owner_id=owner_id,
        rematador_id=rematador_id,
    )
    return Page[RemateRead](items=list(items), total=total, page=page, page_size=page_size)


@router.get(
    "/private/mine",
    response_model=list[RemateRead],
    summary="Remates privados a los que el usuario actual ya canjeó el código",
)
async def list_my_private_access_grants(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> list[Remate]:
    return await service.list_private_access_granted(current_user)


@router.get(
    "/{remate_id}",
    response_model=RemateRead,
    summary=(
        "Detalle de un remate (404 si no es visible para el usuario actual, o para un "
        "visitante anónimo -- ADR-049)"
    ),
)
async def get_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
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


@router.post(
    "/{remate_id}/operator-code",
    response_model=RemateOperatorCodeResponse,
    summary="Generar/regenerar el código de operador de un remate propio (ADR-048)",
)
async def generate_operator_code(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> RemateOperatorCodeResponse:
    remate, code = await service.generate_operator_code(remate_id, current_user)
    return RemateOperatorCodeResponse(code=code, generated_at=remate.operator_code_generated_at)


@router.post(
    "/{remate_id}/claim-operator",
    response_model=RemateRead,
    dependencies=[Depends(require_roles(UserRole.REMATADOR))],
    summary="Canjear un código de operador y quedar asignado a este remate (ADR-048)",
)
async def claim_operator(
    remate_id: uuid.UUID,
    data: RemateOperatorClaimRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.claim_operator(remate_id, current_user, data.code)


@router.post(
    "/{remate_id}/private-access-code",
    response_model=RematePrivateAccessCodeResponse,
    summary="Generar/regenerar el código de acceso de un remate privado propio",
)
async def generate_private_access_code(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> RematePrivateAccessCodeResponse:
    remate, code = await service.generate_private_access_code(remate_id, current_user)
    return RematePrivateAccessCodeResponse(
        code=code, generated_at=remate.private_access_code_generated_at
    )


@router.get(
    "/{remate_id}/private-access-code",
    response_model=RematePrivateAccessCodeResponse,
    summary="Ver el código de acceso ACTUAL de un remate privado propio, sin regenerarlo",
)
async def get_private_access_code(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> RematePrivateAccessCodeResponse:
    result = await service.get_private_access_code(remate_id, current_user)
    if result is None:
        raise NotFoundError("Todavía no se generó un código de acceso para este remate.")
    remate, code = result
    return RematePrivateAccessCodeResponse(
        code=code, generated_at=remate.private_access_code_generated_at
    )


@router.post(
    "/{remate_id}/redeem-private-access",
    response_model=RemateRead,
    dependencies=[Depends(require_roles(UserRole.COMPRADOR))],
    summary="Canjear el código de acceso de un remate privado (acceso persistente al detalle/sala)",
)
async def redeem_private_access(
    remate_id: uuid.UUID,
    data: RematePrivateAccessRedeemRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> Remate:
    return await service.redeem_private_access(remate_id, current_user, data.code)


@router.delete(
    "/{remate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar (soft delete) un remate propio en borrador o cancelado",
)
async def delete_remate(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[RemateService, Depends(get_remate_service)],
) -> None:
    await service.soft_delete(remate_id, current_user)
