"""Lógica de negocio del módulo de usuarios.

Levanta excepciones de dominio (`ConflictError`, `NotFoundError`) definidas en
`app/core/exceptions.py`, nunca `HTTPException` — ver la razón en el docstring de ese
módulo.
"""

import uuid

from fastapi import UploadFile

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.events.bus import EventBus
from app.modules.auth.events import SessionInvalidated
from app.modules.users import media_storage
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import ROLES_PENDING_APPROVAL, UserCreate


class UserService:
    def __init__(self, repository: UserRepository, event_bus: EventBus | None = None) -> None:
        self._repository = repository
        # Opcional -- `None` es un no-op seguro (ver `set_active_status`): mismo
        # criterio permisivo que el resto del proyecto usa para dependencias que solo
        # hace falta pasar de verdad desde algunos callers (`cache: RedisCache | None`
        # en `SnapshotService`, `bot_identity_resolver` en varios servicios). Evita que
        # `app/scripts/create_superuser.py` (que nunca suspende una cuenta, un
        # bootstrap fuera de la app HTTP) necesite construir un `EventBus` real solo
        # para instanciar este servicio.
        self._event_bus = event_bus

    async def register(self, data: UserCreate) -> User:
        existing = await self._repository.get_by_email(data.email)
        if existing is not None:
            raise ConflictError("Ya existe una cuenta registrada con ese email.")

        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            phone=data.phone,
            role=data.role,
            # En condiciones normales, empresa/rematador quedan pendientes de aprobación
            # de un admin (RF-03, `PATCH /users/{id}/status`) antes de poder loguearse --
            # ver `ROLES_PENDING_APPROVAL`. Ahora mismo esa lista está vacía (temporal,
            # mientras se testean las 4 vistas de rol sin depender de un admin, ver el
            # TODO en `schemas.py`), así que todos los roles autoregistrables usan el
            # default de la columna (activo).
            is_active=data.role not in ROLES_PENDING_APPROVAL,
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

        # Fase 3 de remediación del WebSocket Security Audit: una cuenta suspendida ya
        # no puede autenticarse por HTTP (`AuthService.authenticate`/
        # `get_current_user_from_access_token` ya chequean `is_active`), pero una
        # conexión WS abierta ANTES de la suspensión no se enteraba -- seguía viva
        # hasta que el access token expirara por su cuenta. `session_id=None`: se
        # suspende la cuenta entera, no una sesión puntual, así que se cierran todas
        # las conexiones activas del usuario (ver
        # `app/modules/auth/realtime.py::SessionInvalidationDispatcher`). Reactivar una
        # cuenta (`is_active=True`) no invalida nada -- no hay ninguna sesión que cerrar.
        if not is_active and self._event_bus is not None:
            await self._event_bus.publish(
                SessionInvalidated(user_id=user_id, session_id=None, reason="user_suspended")
            )
        return user

    async def list_users(
        self, *, page: int, page_size: int, pending_only: bool = False
    ) -> tuple[list[User], int]:
        offset = (page - 1) * page_size
        return await self._repository.list_all(
            offset=offset, limit=page_size, pending_only=pending_only
        )

    async def upload_avatar_image(
        self, user: User, upload: UploadFile, settings: Settings, request_base_url: str
    ) -> str:
        """Sube una foto de perfil (`POST /users/me/avatar`). No toca la fila de
        `User`, igual que `RemateService.upload_cover_image`: devuelve solo la URL,
        quien la llama decide si la asigna vía `update_avatar`."""
        return await media_storage.save_user_avatar_image(user.id, upload, settings, request_base_url)

    async def update_avatar(self, user: User, avatar_url: str | None) -> User:
        """`PATCH /users/me` -- `avatar_url` puede ser una URL recién subida
        (`upload_avatar_image`), un avatar predeterminado (`"preset:<id>"`, el frontend
        decide qué representa cada id, ver `shared/lib/avatarPresets.ts`) o `None` para
        volver al avatar por defecto (iniciales)."""
        user.avatar_url = avatar_url
        await self._repository.commit()
        await self._repository.refresh(user)
        return user
