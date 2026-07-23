"""Endpoints HTTP del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

Top-level (`/postauction`), no anidado bajo `/remates/{id}/...` -- mismo criterio que
`/audit`/`/history`: "ventas adjudicadas" y "mis compras" son listados propios del
usuario a través de remates arbitrarios, no un sub-recurso de un remate puntual.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.common.schemas import Page
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.postauction.dependencies import get_postauction_service
from app.postauction.models import PostAuctionStatus
from app.postauction.schemas import (
    NoteCreateRequest,
    PostAuctionCaseDetail,
    PostAuctionCaseRead,
    StatusChangeRequest,
)
from app.postauction.service import PostAuctionService

router = APIRouter()

DEFAULT_PAGE_SIZE = 20


@router.get(
    "/postauction/ventas",
    response_model=Page[PostAuctionCaseRead],
    summary="Ventas adjudicadas del rematador actual (o todas, si es admin)",
)
async def list_ventas_adjudicadas(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
    status: PostAuctionStatus | None = None,
    remate_id: uuid.UUID | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> Page[PostAuctionCaseRead]:
    items, total = await service.list_for_rematador(
        current_user,
        status=status,
        remate_id=remate_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    return Page[PostAuctionCaseRead](items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/postauction/ventas/{case_id}",
    response_model=PostAuctionCaseDetail,
    summary="Detalle de una venta adjudicada, con línea de tiempo -- dueño o admin",
)
async def get_venta_adjudicada(
    case_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
) -> PostAuctionCaseDetail:
    return await service.get_detail_for_rematador(case_id, current_user)


@router.patch(
    "/postauction/ventas/{case_id}/estado",
    response_model=PostAuctionCaseDetail,
    summary="Cambiar el estado del proceso post-remate -- dueño o admin",
)
async def change_estado_venta(
    case_id: uuid.UUID,
    data: StatusChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
) -> PostAuctionCaseDetail:
    await service.change_status(
        case_id,
        current_user,
        new_status=data.new_status,
        note=data.note,
        occurred_at=data.occurred_at,
    )
    return await service.get_detail_for_rematador(case_id, current_user)


@router.post(
    "/postauction/ventas/{case_id}/notas",
    response_model=PostAuctionCaseDetail,
    summary="Agregar una observación sin cambiar el estado -- dueño o admin",
)
async def add_nota_venta(
    case_id: uuid.UUID,
    data: NoteCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
) -> PostAuctionCaseDetail:
    await service.add_note(case_id, current_user, data.note)
    return await service.get_detail_for_rematador(case_id, current_user)


@router.get(
    "/postauction/mis-compras",
    response_model=Page[PostAuctionCaseRead],
    summary="Lotes ganados por el comprador actual, con su estado post-remate",
)
async def list_mis_compras(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> Page[PostAuctionCaseRead]:
    items, total = await service.list_for_buyer(current_user, page=page, page_size=page_size)
    return Page[PostAuctionCaseRead](items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/postauction/mis-compras/{case_id}",
    response_model=PostAuctionCaseDetail,
    summary="Detalle de una compra propia, con línea de tiempo",
)
async def get_mi_compra(
    case_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PostAuctionService, Depends(get_postauction_service)],
) -> PostAuctionCaseDetail:
    return await service.get_detail_for_buyer(case_id, current_user)
