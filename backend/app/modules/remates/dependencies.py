from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService


def get_remate_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> RemateRepository:
    return RemateRepository(db)


def get_remate_service(
    repository: Annotated[RemateRepository, Depends(get_remate_repository)],
    db: Annotated[AsyncSession, Depends(get_db)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
) -> RemateService:
    # LoteRepository, no LoteService: RemateService solo necesita leer datos de lotes
    # (¿hay al menos uno? ¿alguno sigue abierto o pendiente?) para el motor de estados
    # (Módulo 2.3, RF-08/RF-10) — inyectar LoteService generaría un import circular,
    # porque `remates/lotes/service.py` ya depende de RemateService. Ver ADR-019.
    # AuditLogRepository (Épica 7, Módulo 7.2, ver ADR-039): mismo criterio, construido
    # directo acá con la misma `db` de la request, no vía `app.audit.dependencies`
    # (evita jalar `AuditService`/`RemateService` sin necesidad).
    return RemateService(repository, LoteRepository(db), event_bus, AuditLogRepository(db))
