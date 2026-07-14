from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.service import LoteService
from app.modules.remates.service import RemateService


def get_lote_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> LoteRepository:
    return LoteRepository(db)


def get_lote_service(
    repository: Annotated[LoteRepository, Depends(get_lote_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
) -> LoteService:
    return LoteService(repository, remate_service, event_bus)
