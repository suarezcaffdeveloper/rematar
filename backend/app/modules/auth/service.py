"""Orquestación de autenticación y sesiones.

`register` delega en `UserService.register` en vez de reimplementar la creación de un
usuario acá: el módulo `auth` no es dueño del recurso `User` (lo es `users`), solo lo usa
para emitir tokens sobre él. Esa es la línea divisoria entre ambos módulos (ver
`app/modules/users/router.py`).

## Auditoría (Épica 7, Módulo 7.2)

`login`/`logout` dejan constancia vía `AuditLogRepository.record` (ver docs/36 y
ADR-039), en la misma transacción que ya comitea `issue_tokens`/la revocación del
refresh token -- nunca vía el Event Bus (best-effort, podría perder el registro).
"""

import uuid
from datetime import UTC, datetime, timedelta

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import RateLimitError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.modules.auth.models import PasswordResetToken, RefreshToken
from app.modules.auth.notifications import AuthEmailNotifier
from app.modules.auth.repository import PasswordResetTokenRepository, RefreshTokenRepository
from app.modules.auth.schemas import Token
from app.modules.auth.security import (
    TokenType,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_and_validate,
)
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate
from app.modules.users.service import UserService
from app.redis.rate_limit import RedisRateLimiter


class AuthService:
    def __init__(
        self,
        *,
        user_repository: UserRepository,
        user_service: UserService,
        refresh_token_repository: RefreshTokenRepository,
        password_reset_token_repository: PasswordResetTokenRepository,
        audit_repository: AuditLogRepository,
        email_notifier: AuthEmailNotifier,
        rate_limiter: RedisRateLimiter,
        settings: Settings,
    ) -> None:
        self._user_repository = user_repository
        self._user_service = user_service
        self._refresh_token_repository = refresh_token_repository
        self._password_reset_token_repository = password_reset_token_repository
        self._audit_repository = audit_repository
        self._email_notifier = email_notifier
        self._rate_limiter = rate_limiter
        self._settings = settings

    async def register(self, data: UserCreate) -> User:
        return await self._user_service.register(data)

    async def authenticate(self, email: str, password: str) -> User:
        user = await self._user_repository.get_by_email(email)
        # Mismo mensaje de error exista o no el email, para no filtrar por enumeración
        # qué emails están registrados (RNF-11).
        if user is None or not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Email o contraseña incorrectos.")
        if not user.is_active:
            raise UnauthorizedError("La cuenta está suspendida.")
        return user

    async def issue_tokens(self, user: User) -> Token:
        refresh_row = RefreshToken(
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self._refresh_token_repository.add(refresh_row)
        await self._refresh_token_repository.commit()
        await self._refresh_token_repository.refresh(refresh_row)

        access_token = create_access_token(user_id=user.id, role=user.role, settings=self._settings)
        refresh_token = create_refresh_token(
            user_id=user.id, jti=refresh_row.id, settings=self._settings
        )
        return Token(access_token=access_token, refresh_token=refresh_token)

    async def login(self, email: str, password: str) -> Token:
        user = await self.authenticate(email, password)
        # `issue_tokens` hace el único commit de este flujo -- este `record` (sin
        # commit propio) queda en esa misma transacción.
        self._audit_repository.record(
            actor_id=user.id,
            actor_name=user.full_name,
            actor_role=user.role.value,
            action=AuditAction.AUTH_LOGIN,
            resource_type="user",
            resource_id=user.id,
        )
        return await self.issue_tokens(user)

    async def refresh(self, refresh_token: str) -> Token:
        payload = decode_and_validate(
            refresh_token, expected_type=TokenType.REFRESH, settings=self._settings
        )
        token_id = uuid.UUID(payload["jti"])

        stored = await self._refresh_token_repository.get_by_id(token_id)
        if stored is None or stored.revoked_at is not None:
            raise UnauthorizedError("La sesión fue revocada o ya no existe.")
        if stored.expires_at < datetime.now(UTC):
            raise UnauthorizedError("La sesión expiró.")

        user = await self._user_repository.get_by_id(stored.user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError("Cuenta inexistente o suspendida.")

        # Rotación: se revoca el token usado antes de emitir uno nuevo. Si alguna vez se
        # presenta este mismo `jti` de nuevo, es señal de reuso de un token ya consumido
        # (ver docs/adr/ADR-011-refresh-tokens-persistidos-en-postgres.md).
        stored.revoked_at = datetime.now(UTC)
        await self._refresh_token_repository.commit()

        return await self.issue_tokens(user)

    async def logout(self, refresh_token: str) -> None:
        payload = decode_and_validate(
            refresh_token, expected_type=TokenType.REFRESH, settings=self._settings
        )
        token_id = uuid.UUID(payload["jti"])

        stored = await self._refresh_token_repository.get_by_id(token_id)
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            # Se busca el User (no viaja en el payload del refresh token) únicamente
            # para denormalizar nombre/rol en la entrada de auditoría -- un logout no es
            # un camino de alta frecuencia, el costo de esta consulta puntual por PK es
            # despreciable.
            user = await self._user_repository.get_by_id(stored.user_id)
            self._audit_repository.record(
                actor_id=stored.user_id,
                actor_name=user.full_name if user else None,
                actor_role=user.role.value if user else None,
                action=AuditAction.AUTH_LOGOUT,
                resource_type="user",
                resource_id=stored.user_id,
            )
            await self._refresh_token_repository.commit()

    async def get_current_user_from_access_token(self, token: str) -> User:
        payload = decode_and_validate(
            token, expected_type=TokenType.ACCESS, settings=self._settings
        )
        user_id = uuid.UUID(payload["sub"])
        user = await self._user_repository.get_by_id(user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError("Cuenta inexistente o suspendida.")
        return user

    async def request_password_reset(self, email: str) -> None:
        """No lanza si el email no existe -- el router siempre responde igual (RNF-11,
        mismo criterio que `authenticate`), así que acá no hay nada que comunicar hacia
        afuera en ese caso, solo no hacer nada."""
        allowed = await self._rate_limiter.check_and_increment(
            f"password_reset:{email.strip().lower()}",
            limit=self._settings.PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS,
            window_seconds=self._settings.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            raise RateLimitError(
                "Ya pediste varios links de recuperación. Esperá unos minutos antes de "
                "volver a intentar."
            )

        user = await self._user_repository.get_by_email(email)
        if user is None or not user.is_active:
            return

        # Un pedido nuevo invalida cualquier link anterior sin usar -- solo el último
        # enviado por email sirve.
        await self._password_reset_token_repository.invalidate_all_for_user(user.id)

        reset_row = PasswordResetToken(
            user_id=user.id,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=self._settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )
        self._password_reset_token_repository.add(reset_row)

        self._audit_repository.record(
            actor_id=user.id,
            actor_name=user.full_name,
            actor_role=user.role.value,
            action=AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
            resource_type="user",
            resource_id=user.id,
        )

        await self._password_reset_token_repository.commit()
        await self._password_reset_token_repository.refresh(reset_row)

        token = create_password_reset_token(
            user_id=user.id, jti=reset_row.id, settings=self._settings
        )
        reset_url = f"{self._settings.FRONTEND_URL}/reset-password?token={token}"
        await self._email_notifier.send_password_reset(
            to=user.email,
            to_name=user.full_name,
            reset_url=reset_url,
            expires_minutes=self._settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
        )

    async def _get_valid_reset_token(self, token: str) -> tuple[PasswordResetToken, User]:
        """Centraliza la validación que comparten `validate_reset_token` y
        `reset_password`: firma/expiración del JWT (vía `decode_and_validate`) y,
        además, que la fila persistida siga sin usarse y sin vencer -- mismo doble
        chequeo que `AuthService.refresh` hace con los refresh tokens."""
        payload = decode_and_validate(
            token, expected_type=TokenType.PASSWORD_RESET, settings=self._settings
        )
        token_id = uuid.UUID(payload["jti"])

        stored = await self._password_reset_token_repository.get_by_id(token_id)
        if stored is None or stored.used_at is not None:
            raise UnauthorizedError("El link de recuperación ya fue usado o no es válido.")
        if stored.expires_at < datetime.now(UTC):
            raise UnauthorizedError("El link de recuperación expiró.")

        user = await self._user_repository.get_by_id(stored.user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError("Cuenta inexistente o suspendida.")

        return stored, user

    async def validate_reset_token(self, token: str) -> None:
        """Levanta `UnauthorizedError` si el link ya no sirve -- se usa para que el
        frontend avise apenas se abre la página, antes de que el usuario escriba la
        contraseña nueva."""
        await self._get_valid_reset_token(token)

    async def reset_password(self, token: str, new_password: str) -> None:
        stored, user = await self._get_valid_reset_token(token)

        user.hashed_password = hash_password(new_password)
        stored.used_at = datetime.now(UTC)

        # Cierra cualquier sesión activa -- si alguien más quedó logueado con la
        # contraseña vieja (por ejemplo, quien la comprometió), esto lo saca (RNF-11).
        await self._refresh_token_repository.revoke_all_for_user(user.id)

        self._audit_repository.record(
            actor_id=user.id,
            actor_name=user.full_name,
            actor_role=user.role.value,
            action=AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
            resource_type="user",
            resource_id=user.id,
        )

        await self._password_reset_token_repository.commit()

        # Aviso de seguridad: si un atacante completó el flujo, el dueño real de la
        # cuenta se entera. No lleva ningún link de acción.
        await self._email_notifier.send_password_changed(to=user.email, to_name=user.full_name)
