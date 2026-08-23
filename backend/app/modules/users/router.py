"""Endpoints del recurso `User`.

Notar qué NO está acá: login, registro, refresh y logout viven en
`app/modules/auth/router.py`. Este router solo expone operaciones sobre el recurso
usuario ya autenticado (perfil propio, administración de cuentas) — la distinción entre
"gestionar credenciales/sesión" (auth) y "gestionar el recurso usuario" (users) es
deliberada, ver `docs/09-arquitectura-y-decisiones.md`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status

from app.common.schemas import Page
from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.users.dependencies import get_user_service
from app.modules.users.models import User, UserRole
from app.modules.users.schemas import (
    UserAvatarUpdate,
    UserAvatarUploadResponse,
    UserRead,
    UserStatusUpdate,
)
from app.modules.users.service import UserService

router = APIRouter()


@router.get("/me", response_model=UserRead, summary="Perfil del usuario autenticado")
async def read_current_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.post(
    "/me/avatar",
    response_model=UserAvatarUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Subir una foto de perfil (pantalla 'Mi perfil')",
)
async def upload_current_user_avatar(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserService, Depends(get_user_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
) -> UserAvatarUploadResponse:
    # Sin restricción de rol: cualquier usuario autenticado edita su propia foto --
    # mismo criterio que `GET /me`. No persiste nada todavía, ver
    # `UserService.upload_avatar_image`.
    url = await service.upload_avatar_image(current_user, file, settings, str(request.base_url))
    return UserAvatarUploadResponse(url=url)


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Actualizar la foto de perfil del usuario autenticado",
)
async def update_current_user(
    payload: UserAvatarUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserService, Depends(get_user_service)],
) -> User:
    return await service.update_avatar(current_user, payload.avatar_url)


@router.get(
    "",
    response_model=Page[UserRead],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    summary="Listar usuarios (solo administrador)",
)
async def list_users(
    service: Annotated[UserService, Depends(get_user_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    pending_only: bool = Query(
        default=False,
        description="Solo cuentas empresa/rematador todavía sin aprobar (is_active=false).",
    ),
) -> Page[UserRead]:
    users, total = await service.list_users(page=page, page_size=page_size, pending_only=pending_only)
    return Page[UserRead](items=list(users), total=total, page=page, page_size=page_size)


@router.patch(
    "/{user_id}/status",
    response_model=UserRead,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    summary="Activar/suspender una cuenta (solo administrador, RF-03)",
)
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    service: Annotated[UserService, Depends(get_user_service)],
) -> User:
    return await service.set_active_status(user_id, payload.is_active)
