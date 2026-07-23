"""Endpoints HTTP de las acciones del rematador sobre el timer de un lote (Épica 8,
"cuenta regresiva y cierre automático"). Ver docs/40-cuenta-regresiva-y-cierre-automatico.md.

Mismo criterio que `app/snapshot/router.py`: no vive dentro de `app/modules/remates/`
(no se toca `lotes/router.py`) -- se monta directamente en `app/api/router.py` con el
mismo path efectivo que tendría si colgara de ahí
(`/remates/{remate_id}/lotes/{lote_id}/timer/...`).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.auth.dependencies import get_current_user
from app.modules.remates.lotes.models import Lote
from app.modules.remates.lotes.schemas import LoteRead
from app.modules.users.models import User
from app.timer.dependencies import get_timer_service
from app.timer.schemas import TimerAutoCloseRequest, TimerRemainingRequest
from app.timer.service import TimerService

router = APIRouter()

_PREFIX = "/remates/{remate_id}/lotes/{lote_id}/timer"


@router.post(f"{_PREFIX}/pause", response_model=LoteRead, summary="Pausar el timer de un lote propio")
async def pause_lote_timer(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimerService, Depends(get_timer_service)],
) -> Lote:
    return await service.pause(remate_id, lote_id, current_user)


@router.post(f"{_PREFIX}/resume", response_model=LoteRead, summary="Reanudar el timer de un lote propio")
async def resume_lote_timer(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimerService, Depends(get_timer_service)],
) -> Lote:
    return await service.resume(remate_id, lote_id, current_user)


@router.post(
    f"{_PREFIX}/reset",
    response_model=LoteRead,
    summary="Reiniciar el timer de un lote propio a la duración completa configurada",
)
async def reset_lote_timer(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimerService, Depends(get_timer_service)],
) -> Lote:
    return await service.reset(remate_id, lote_id, current_user)


@router.post(
    f"{_PREFIX}/remaining",
    response_model=LoteRead,
    summary="Fijar manualmente el tiempo restante del timer de un lote propio",
)
async def set_lote_timer_remaining(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    data: TimerRemainingRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimerService, Depends(get_timer_service)],
) -> Lote:
    return await service.set_remaining(remate_id, lote_id, current_user, data.seconds)


@router.post(
    f"{_PREFIX}/auto-close",
    response_model=LoteRead,
    summary="Activar o desactivar el cierre automático al vencer el timer de un lote propio",
)
async def set_lote_timer_auto_close(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    data: TimerAutoCloseRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TimerService, Depends(get_timer_service)],
) -> Lote:
    return await service.set_auto_close_enabled(remate_id, lote_id, current_user, data.enabled)
