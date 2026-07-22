from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.dependencies import get_analytics_repository
from app.analytics.repository import AnalyticsRepository
from app.db.session import get_db
from app.history.repository import HistoryRepository
from app.history.service import HistoryService
from app.modules.ofertas.dependencies import get_oferta_repository
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.dependencies import get_lote_repository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.service import RemateService


def get_history_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> HistoryRepository:
    return HistoryRepository(db)


def get_history_service(
    repository: Annotated[HistoryRepository, Depends(get_history_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    analytics_repository: Annotated[AnalyticsRepository, Depends(get_analytics_repository)],
    lote_repository: Annotated[LoteRepository, Depends(get_lote_repository)],
    oferta_repository: Annotated[OfertaRepository, Depends(get_oferta_repository)],
) -> HistoryService:
    return HistoryService(
        repository, remate_service, analytics_repository, lote_repository, oferta_repository
    )
