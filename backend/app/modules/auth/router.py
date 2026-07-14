"""Endpoints públicos de autenticación: registro, login, refresh y logout.

`login` usa `OAuth2PasswordRequestForm` (form-data con campos `username`/`password`, no
JSON) a propósito: es lo que hace que Swagger UI (`/docs`) muestre el botón "Authorize" y
permita probar endpoints protegidos de forma interactiva sin armar el header a mano — un
detalle chico que hace la documentación automática realmente usable, no solo descriptiva.
`username` es el email en este sistema; no hay un campo de "nombre de usuario" separado.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from app.modules.auth.dependencies import get_auth_service
from app.modules.auth.schemas import LogoutRequest, RefreshRequest, Token
from app.modules.auth.service import AuthService
from app.modules.users.schemas import UserCreate, UserRead

router = APIRouter()


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Registro público (solo rematador o comprador, RF-01)",
)
async def register(
    data: UserCreate,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserRead:
    user = await auth_service.register(data)
    return UserRead.model_validate(user)


@router.post("/login", response_model=Token, summary="Login (RF-01)")
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> Token:
    return await auth_service.login(form_data.username, form_data.password)


@router.post("/refresh", response_model=Token, summary="Renovar access token")
async def refresh(
    payload: RefreshRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> Token:
    return await auth_service.refresh(payload.refresh_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar sesión (revoca el refresh token, ver ADR-011)",
)
async def logout(
    payload: LogoutRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> None:
    await auth_service.logout(payload.refresh_token)
