"""Dependencias de FastAPI del módulo auth: inyección de AuthService y RBAC reutilizable.

`require_roles(*roles)` es la pieza que hace "Roles funcionando" verificable en toda la
API: cualquier router futuro (remates, lotes, ofertas, en fases siguientes) protege un
endpoint agregando `dependencies=[Depends(require_roles(UserRole.REMATADOR))]`, sin
duplicar lógica de autorización en cada handler.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.dependencies import get_audit_log_repository
from app.audit.repository import AuditLogRepository
from app.core.config import Settings, get_settings
from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.auth.notifications import AuthEmailNotifier
from app.modules.auth.repository import PasswordResetTokenRepository, RefreshTokenRepository
from app.modules.auth.service import AuthService
from app.modules.users.dependencies import get_user_repository, get_user_service
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService
from app.notify.dependencies import get_email_sender
from app.redis.dependencies import get_rate_limiter
from app.redis.rate_limit import RedisRateLimiter

_settings = get_settings()

# `tokenUrl` es solo lo que Swagger UI usa para el botón "Authorize" (RNF: documentación
# automática usable) — no es la única forma de loguearse, es la ruta real del endpoint.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{_settings.API_V1_PREFIX}/auth/login")


def get_refresh_token_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefreshTokenRepository:
    return RefreshTokenRepository(db)


def get_password_reset_token_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PasswordResetTokenRepository:
    return PasswordResetTokenRepository(db)


def get_auth_email_notifier(
    email_sender: Annotated[EmailSender, Depends(get_email_sender)],
) -> AuthEmailNotifier:
    return AuthEmailNotifier(email_sender, EmailTemplateRenderer())


def get_auth_service(
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
    user_service: Annotated[UserService, Depends(get_user_service)],
    refresh_token_repository: Annotated[
        RefreshTokenRepository, Depends(get_refresh_token_repository)
    ],
    password_reset_token_repository: Annotated[
        PasswordResetTokenRepository, Depends(get_password_reset_token_repository)
    ],
    audit_repository: Annotated[AuditLogRepository, Depends(get_audit_log_repository)],
    email_notifier: Annotated[AuthEmailNotifier, Depends(get_auth_email_notifier)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(
        user_repository=user_repository,
        user_service=user_service,
        refresh_token_repository=refresh_token_repository,
        password_reset_token_repository=password_reset_token_repository,
        audit_repository=audit_repository,
        email_notifier=email_notifier,
        rate_limiter=rate_limiter,
        event_bus=event_bus,
        settings=settings,
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> User:
    return await auth_service.get_current_user_from_access_token(token)


def require_roles(*allowed_roles: UserRole):
    """Fábrica de dependencias: exige que el usuario autenticado tenga uno de `allowed_roles`.

    Uso: `dependencies=[Depends(require_roles(UserRole.ADMIN))]` en un router o endpoint.
    """

    async def _check(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenError("No tenés permisos para realizar esta acción.")
        return current_user

    return _check
