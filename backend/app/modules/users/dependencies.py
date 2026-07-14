"""Cadena de dependencias de FastAPI para inyectar repositorio/servicio de usuarios.

Encadenar `Depends` así (sesión -> repositorio -> servicio) es lo que permite, en tests,
reemplazar únicamente `get_db` (ver `tests/conftest.py`) y que todo lo demás se arme
solo con la sesión de test, sin mockear nada del módulo de negocio.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService


def get_user_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> UserRepository:
    return UserRepository(db)


def get_user_service(
    repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> UserService:
    return UserService(repository)
