from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.redis.dependencies import get_rate_limiter
from app.redis.rate_limit import RedisRateLimiter


def get_remate_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> RemateRepository:
    return RemateRepository(db)


def get_remate_service(
    repository: Annotated[RemateRepository, Depends(get_remate_repository)],
    db: Annotated[AsyncSession, Depends(get_db)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RemateService:
    # LoteRepository, no LoteService: RemateService solo necesita leer datos de lotes
    # (¿hay al menos uno? ¿alguno sigue abierto o pendiente?) para el motor de estados
    # (Módulo 2.3, RF-08/RF-10) — inyectar LoteService generaría un import circular,
    # porque `remates/lotes/service.py` ya depende de RemateService. Ver ADR-019.
    # AuditLogRepository (Épica 7, Módulo 7.2, ver ADR-039): mismo criterio, construido
    # directo acá con la misma `db` de la request, no vía `app.audit.dependencies`
    # (evita jalar `AuditService`/`RemateService` sin necesidad).
    # rate_limiter/settings: solo para el flujo de remates privados -- rate limiting en
    # redeem_private_access, y SECRET_KEY (vía settings) para cifrar/descifrar el
    # código en create/generate_private_access_code/get_private_access_code/
    # redeem_private_access (ver el docstring de RemateService.__init__ sobre por qué
    # son opcionales ahí).
    return RemateService(
        repository,
        LoteRepository(db),
        event_bus,
        AuditLogRepository(db),
        rate_limiter=rate_limiter,
        settings=settings,
    )
