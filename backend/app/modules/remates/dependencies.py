from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService


def get_remate_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> RemateRepository:
    return RemateRepository(db)


def get_remate_service(
    repository: Annotated[RemateRepository, Depends(get_remate_repository)],
) -> RemateService:
    return RemateService(repository)
