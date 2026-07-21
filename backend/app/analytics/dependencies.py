"""Dependencia de FastAPI del `AnalyticsService`. Ver
docs/35-dashboard-analitica-tiempo-real.md.

Más simple que `snapshot/dependencies.py`: el Analytics Service es HTTP-only (nunca se
invoca desde el Gateway WebSocket), así que no hace falta el patrón `HTTPConnection`
que `SnapshotService`/`PresenceService` necesitan para funcionar desde ambos
transportes -- acá alcanza con reusar, tal cual, las dependencias `Request`-based que
ya existen: `get_remate_service` (`app.modules.remates.dependencies`), `get_presence_service`
(`app.presence.dependencies`, ya funciona desde un router HTTP plano -- lo prueba
`snapshot_router` usándola así hoy) y `get_cache` (`app.redis.dependencies`).
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.repository import AnalyticsRepository
from app.analytics.service import AnalyticsService
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService
from app.presence.dependencies import get_presence_service
from app.presence.service import PresenceService
from app.redis.cache import RedisCache
from app.redis.dependencies import get_cache


def get_analytics_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyticsRepository:
    return AnalyticsRepository(db)


def get_analytics_service(
    repository: Annotated[AnalyticsRepository, Depends(get_analytics_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    presence_service: Annotated[PresenceService, Depends(get_presence_service)],
    cache: Annotated[RedisCache, Depends(get_cache)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalyticsService:
    return AnalyticsService(
        repository,
        remate_service,
        presence_service,
        cache=cache,
        cache_ttl_seconds=settings.ANALYTICS_CACHE_TTL_SECONDS,
        bids_timeline_minutes=settings.ANALYTICS_BIDS_TIMELINE_MINUTES,
        recent_events_limit=settings.ANALYTICS_RECENT_EVENTS_LIMIT,
        offers_rate_window_seconds=settings.ANALYTICS_OFFERS_RATE_WINDOW_SECONDS,
    )
