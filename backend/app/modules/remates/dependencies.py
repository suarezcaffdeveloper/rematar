from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService


def get_remate_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> RemateRepository:
    return RemateRepository(db)


def get_remate_service(
    repository: Annotated[RemateRepository, Depends(get_remate_repository)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RemateService:
    # LoteRepository, no LoteService: RemateService solo necesita leer datos de lotes
    # (¿hay al menos uno? ¿alguno sigue abierto o pendiente?) para el motor de estados
    # (Módulo 2.3, RF-08/RF-10) — inyectar LoteService generaría un import circular,
    # porque `remates/lotes/service.py` ya depende de RemateService. Ver ADR-019.
    return RemateService(repository, LoteRepository(db))
