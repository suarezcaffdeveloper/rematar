"""Dependencias de FastAPI del módulo de bots simuladores de compradores."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.bots.repository import (
    BotProfileRepository,
    BotRemateSelectionRepository,
    BotSimulationRunRepository,
)
from app.modules.bots.runner import BotRunnerRegistry
from app.modules.bots.service import BotProfileService, BotSimulationService
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService
from app.modules.users.dependencies import get_user_repository
from app.modules.users.repository import UserRepository


def get_bot_profile_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotProfileRepository:
    return BotProfileRepository(db)


def get_bot_selection_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotRemateSelectionRepository:
    return BotRemateSelectionRepository(db)


def get_bot_simulation_run_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BotSimulationRunRepository:
    return BotSimulationRunRepository(db)


def get_bot_profile_service(
    repository: Annotated[BotProfileRepository, Depends(get_bot_profile_repository)],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
    selection_repository: Annotated[
        BotRemateSelectionRepository, Depends(get_bot_selection_repository)
    ],
    run_repository: Annotated[BotSimulationRunRepository, Depends(get_bot_simulation_run_repository)],
) -> BotProfileService:
    return BotProfileService(repository, user_repository, selection_repository, run_repository)


def get_bot_runner_registry(request: Request) -> BotRunnerRegistry:
    # `app.state.bot_runner_registry` se crea una única vez en el `lifespan`
    # (`app/main.py`) -- mismo criterio que `get_connection_manager`/`get_room_manager`
    # del Gateway WebSocket: un registro en memoria compartido por todo el proceso, no
    # uno nuevo por request.
    return request.app.state.bot_runner_registry


def get_bot_simulation_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    selection_repository: Annotated[
        BotRemateSelectionRepository, Depends(get_bot_selection_repository)
    ],
    run_repository: Annotated[BotSimulationRunRepository, Depends(get_bot_simulation_run_repository)],
    profile_repository: Annotated[BotProfileRepository, Depends(get_bot_profile_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    runner_registry: Annotated[BotRunnerRegistry, Depends(get_bot_runner_registry)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
) -> BotSimulationService:
    return BotSimulationService(
        db,
        selection_repository,
        run_repository,
        profile_repository,
        remate_service,
        runner_registry,
        event_bus,
    )
