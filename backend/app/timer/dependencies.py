from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.dependencies import get_lote_repository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.service import RemateService
from app.timer.service import TimerService


def get_timer_service(
    repository: Annotated[LoteRepository, Depends(get_lote_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TimerService:
    return TimerService(repository, remate_service, event_bus, AuditLogRepository(db))
