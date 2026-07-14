"""Lógica de negocio del módulo de usuarios.

Levanta excepciones de dominio (`ConflictError`, `NotFoundError`) definidas en
`app/core/exceptions.py`, nunca `HTTPException` — ver la razón en el docstring de ese
módulo.
"""

import uuid

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate


class UserService:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def register(self, data: UserCreate) -> User:
        existing = await self._repository.get_by_email(data.email)
        if existing is not None:
            raise ConflictError("Ya existe una cuenta registrada con ese email.")

        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            role=data.role,
        )
        self._repository.add(user)
        await self._repository.commit()
        await self._repository.refresh(user)
        return user

    async def create_admin_if_missing(
        self, *, email: str, password: str, full_name: str
    ) -> User | None:
        """Usado exclusivamente por `app/scripts/create_superuser.py`.

        No es un endpoint público: crear un administrador es un paso de bootstrap
        operativo, no una acción de negocio expuesta por la API (ver
        `docs/adr/ADR-010-enum-nativo-de-roles-en-postgres.md` y la restricción de rol en
        `UserCreate`).
        """
        existing = await self._repository.get_by_email(email)
        if existing is not None:
            return None

        admin = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=UserRole.ADMIN,
        )
        self._repository.add(admin)
        await self._repository.commit()
        await self._repository.refresh(admin)
        return admin

    async def get_by_id_or_raise(self, user_id: uuid.UUID) -> User:
        user = await self._repository.get_by_id(user_id)
        if user is None:
            raise NotFoundError("Usuario no encontrado.")
        return user

    async def set_active_status(self, user_id: uuid.UUID, is_active: bool) -> User:
        user = await self.get_by_id_or_raise(user_id)
        user.is_active = is_active
        await self._repository.commit()
        await self._repository.refresh(user)
        return user

    async def list_users(self, *, page: int, page_size: int) -> tuple[list[User], int]:
        offset = (page - 1) * page_size
        return await self._repository.list_all(offset=offset, limit=page_size)
