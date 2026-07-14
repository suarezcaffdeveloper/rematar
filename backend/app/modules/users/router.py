"""Endpoints del recurso `User`.

Notar qué NO está acá: login, registro, refresh y logout viven en
`app/modules/auth/router.py`. Este router solo expone operaciones sobre el recurso
usuario ya autenticado (perfil propio, administración de cuentas) — la distinción entre
"gestionar credenciales/sesión" (auth) y "gestionar el recurso usuario" (users) es
deliberada, ver `docs/09-arquitectura-y-decisiones.md`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.common.schemas import Page
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.users.dependencies import get_user_service
from app.modules.users.models import User, UserRole
from app.modules.users.schemas import UserRead, UserStatusUpdate
from app.modules.users.service import UserService

router = APIRouter()


@router.get("/me", response_model=UserRead, summary="Perfil del usuario autenticado")
async def read_current_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


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
) -> Page[UserRead]:
    users, total = await service.list_users(page=page, page_size=page_size)
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
