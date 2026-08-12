"""Endpoints del módulo de bots simuladores de compradores.

Montado directamente en `app/api/router.py`, mismo criterio que `chat_router`: un
módulo top-level propio que expone dos familias de rutas bajo el mismo prefijo
efectivo sin vivir dentro de `app/modules/remates/` -- gestión global reutilizable
(`/bots`) y control por remate (`/remates/{remate_id}/bots/...`).

Ownership: igual que `remates_router`, no hay `require_roles` en la mayoría de los
endpoints -- la regla es "sos el dueño de este bot/remate en particular"
(`BotProfileService.get_owned_or_raise`/`RemateService.get_owned_or_raise`), no "qué rol
tenés". La excepción es crear un bot (`POST /bots`): un comprador no tiene ningún caso de
uso legítimo para crear un bot propio, así que se exige el rol `rematador` desde el
router, mismo criterio que `POST /remates`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.bots.dependencies import get_bot_profile_service, get_bot_simulation_service
from app.modules.bots.models import BotProfile, BotSimulationRun
from app.modules.bots.schemas import (
    BotProfileCreate,
    BotProfileRead,
    BotProfileUpdate,
    BotRosterEntry,
    BotSelectionSetRequest,
    BotSimulationRunRead,
)
from app.modules.bots.service import BotProfileService, BotSimulationService
from app.modules.users.models import User, UserRole

router = APIRouter()


@router.post(
    "/bots",
    response_model=BotProfileRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.REMATADOR))],
    summary="Crear un bot simulador de comprador",
)
async def create_bot(
    data: BotProfileCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotProfileService, Depends(get_bot_profile_service)],
) -> BotProfile:
    return await service.create(current_user, data)


@router.get(
    "/bots",
    response_model=list[BotProfileRead],
    summary="Listar los bots simuladores propios",
)
async def list_bots(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotProfileService, Depends(get_bot_profile_service)],
) -> list[BotProfile]:
    return await service.list_for_owner(current_user)


@router.get(
    "/bots/{bot_id}",
    response_model=BotProfileRead,
    summary="Ver un bot simulador propio",
)
async def get_bot(
    bot_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotProfileService, Depends(get_bot_profile_service)],
) -> BotProfile:
    return await service.get_owned_or_raise(bot_id, current_user)


@router.patch(
    "/bots/{bot_id}",
    response_model=BotProfileRead,
    summary="Editar la configuración de un bot simulador propio",
)
async def update_bot(
    bot_id: uuid.UUID,
    data: BotProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotProfileService, Depends(get_bot_profile_service)],
) -> BotProfile:
    return await service.update(bot_id, current_user, data)


@router.delete(
    "/bots/{bot_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar (soft-delete) un bot simulador propio",
)
async def delete_bot(
    bot_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotProfileService, Depends(get_bot_profile_service)],
) -> None:
    await service.delete(bot_id, current_user)


@router.get(
    "/remates/{remate_id}/bots/roster",
    response_model=list[BotRosterEntry],
    summary="Bots seleccionados para participar en un remate",
)
async def get_bot_roster(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> list[BotRosterEntry]:
    return await service.get_roster(remate_id, current_user)


@router.put(
    "/remates/{remate_id}/bots/selection",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Definir qué bots participan en un remate (reemplaza la selección completa)",
)
async def set_bot_selection(
    remate_id: uuid.UUID,
    data: BotSelectionSetRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> None:
    await service.set_selection(remate_id, current_user, data.bot_profile_ids)


@router.get(
    "/remates/{remate_id}/bots/simulation",
    response_model=BotSimulationRunRead | None,
    summary="Estado actual de la simulación de bots del remate",
)
async def get_bot_simulation(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> BotSimulationRun | None:
    return await service.get_run(remate_id, current_user)


@router.post(
    "/remates/{remate_id}/bots/simulation/start",
    response_model=BotSimulationRunRead,
    summary="Iniciar (o reanudar) la simulación de bots del remate",
)
async def start_bot_simulation(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> BotSimulationRun:
    return await service.start(remate_id, current_user)


@router.post(
    "/remates/{remate_id}/bots/simulation/pause",
    response_model=BotSimulationRunRead,
    summary="Pausar la simulación de bots del remate",
)
async def pause_bot_simulation(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> BotSimulationRun:
    return await service.pause(remate_id, current_user)


@router.post(
    "/remates/{remate_id}/bots/simulation/stop",
    response_model=BotSimulationRunRead,
    summary="Detener la simulación de bots del remate",
)
async def stop_bot_simulation(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[BotSimulationService, Depends(get_bot_simulation_service)],
) -> BotSimulationRun:
    return await service.stop(remate_id, current_user)
