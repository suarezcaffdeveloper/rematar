"""Dependencia de FastAPI del `SnapshotService`. Ver docs/23-snapshot-service.md y
ADR-026, sección F.

Compone dependencias que ya existían (`get_db`, `get_oferta_repository`,
`get_settings`) sin modificar ninguna — funciona igual desde un endpoint HTTP que desde
el Gateway WebSocket, porque ninguna de ellas es específica de un transporte
(`get_auth_service` ya se reutiliza así desde el Módulo 3.3).

`RemateService` (necesario para `get_visible_or_raise`) es la única excepción: la
dependencia ya existente (`app.modules.remates.dependencies.get_remate_service`)
encadena, por su propio constructor, hasta `get_event_bus` -> `get_pubsub` ->
`get_redis_client(request: Request)` (Módulos 3.1/3.2, sin modificar) — y `Request`
solo se puede inyectar en rutas HTTP, así que reusarla acá rompería al Gateway
WebSocket con un `TypeError` en tiempo de resolución de dependencias.
`HTTPConnection` (`starlette.requests`) es la clase base común de `Request` y
`WebSocket` que FastAPI sí sabe inyectar en ambos casos: `_get_event_bus` y `_get_cache`
la usan para construir, sin tocar `app/redis/` ni `app/events/`, los mismos
`RedisEventBus`/`RedisCache` que sus contrapartes HTTP-only ya arman internamente.
`get_visible_or_raise` (lo único que `SnapshotService` usa de `RemateService`) nunca
publica eventos, pero se le da un `EventBus` totalmente funcional de todos modos —
no uno "no-op" — para que `RemateService` quede completo y utilizable por cualquier
método futuro sin sorpresas.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import HTTPConnection

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.redis_bus import RedisEventBus
from app.modules.ofertas.dependencies import get_oferta_repository
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.redis.cache import RedisCache
from app.redis.pubsub import RedisPubSub
from app.snapshot.service import SnapshotService


def _get_cache(connection: HTTPConnection) -> RedisCache:
    return RedisCache(connection.app.state.redis)


def _get_event_bus(connection: HTTPConnection) -> EventBus:
    return RedisEventBus(RedisPubSub(connection.app.state.redis))


def _get_remate_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    event_bus: Annotated[EventBus, Depends(_get_event_bus)],
) -> RemateService:
    return RemateService(RemateRepository(db), LoteRepository(db), event_bus)


def get_snapshot_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    remate_service: Annotated[RemateService, Depends(_get_remate_service)],
    oferta_repository: Annotated[OfertaRepository, Depends(get_oferta_repository)],
    cache: Annotated[RedisCache, Depends(_get_cache)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SnapshotService:
    return SnapshotService(
        db,
        remate_service,
        oferta_repository,
        cache=cache,
        recent_offers_limit=settings.SNAPSHOT_RECENT_OFFERS_LIMIT,
        cache_ttl_seconds=settings.SNAPSHOT_CACHE_TTL_SECONDS,
    )
