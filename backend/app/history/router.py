"""Endpoints HTTP del History Service (Épica 7, Módulo 7.3). Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040.

Top-level (`/history`), no anidado bajo `/remates/{id}/...` -- mismo criterio que
`/audit`: `GET /history/remates` es un listado global propio (scoped por rol dentro del
service, no un sub-recurso de un remate puntual). Anidar como `/remates/history`
colisionaría en la práctica con el patrón de ruta dinámica `/remates/{remate_id}` ya
registrado en `app/modules/remates/router.py`.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.common.schemas import Page
from app.history.dependencies import get_history_service
from app.history.schemas import (
    FinishedRemateSummary,
    HistoryListFilters,
    HistorySortOption,
    LoteHistoryDetail,
    RemateHistoryDetail,
)
from app.history.service import HistoryService
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User

router = APIRouter()

DEFAULT_PAGE_SIZE = 20


def _filters(
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: HistorySortOption = "date_desc",
) -> HistoryListFilters:
    return HistoryListFilters(search=search, date_from=date_from, date_to=date_to, sort=sort)


@router.get(
    "/history/remates",
    response_model=Page[FinishedRemateSummary],
    summary="Listado de remates finalizados/cancelados -- rematador (propios) o admin (todos)",
)
async def list_finished_remates(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HistoryService, Depends(get_history_service)],
    filters: Annotated[HistoryListFilters, Depends(_filters)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> Page[FinishedRemateSummary]:
    items, total = await service.list_finished(
        viewer=current_user, filters=filters, page=page, page_size=page_size
    )
    return Page[FinishedRemateSummary](items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/history/remates/{remate_id}",
    response_model=RemateHistoryDetail,
    summary="Detalle histórico de un remate finalizado/cancelado -- dueño o admin",
)
async def get_remate_history(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HistoryService, Depends(get_history_service)],
) -> RemateHistoryDetail:
    return await service.get_detail(remate_id, current_user)


@router.get(
    "/history/remates/{remate_id}/lotes/{lote_id}",
    response_model=LoteHistoryDetail,
    summary="Detalle histórico de un lote (ganador, precios, historial de ofertas) -- dueño o admin",
)
async def get_lote_history(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[HistoryService, Depends(get_history_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> LoteHistoryDetail:
    return await service.get_lote_detail(
        remate_id, lote_id, current_user, page=page, page_size=page_size
    )
