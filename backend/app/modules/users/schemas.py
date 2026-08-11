"""Schemas Pydantic del módulo de usuarios.

`UserCreate.role` restringe explícitamente qué roles se pueden auto-asignar por registro
público: nunca `admin`. Una cuenta de administrador se crea exclusivamente vía
`app/scripts/create_superuser.py` (ver README) — permitir `role=admin` en el body de un
POST público sería una escalada de privilegios trivial.
"""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.modules.users.models import UserRole

PUBLICLY_REGISTERABLE_ROLES = {UserRole.REMATADOR, UserRole.COMPRADOR}

# Formato tipo E.164 (dígitos, `+` opcional al inicio, hasta 15 dígitos según el estándar
# ITU): no es un requisito arbitrario, es lo que después va a esperar la API de WhatsApp
# con la que se integre este dato (ver docstring de `User.phone` en models.py).
PHONE_PATTERN = re.compile(r"^\+?\d{8,15}$")
_PHONE_STRIP_CHARS = re.compile(r"[\s\-()]")


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=6, max_length=30)
    role: UserRole

    @field_validator("role")
    @classmethod
    def role_must_be_publicly_registerable(cls, value: UserRole) -> UserRole:
        if value not in PUBLICLY_REGISTERABLE_ROLES:
            raise ValueError(
                "El rol debe ser 'rematador' o 'comprador'. Las cuentas de "
                "administrador no se crean por registro público."
            )
        return value

    @field_validator("phone")
    @classmethod
    def phone_must_be_valid(cls, value: str) -> str:
        normalized = _PHONE_STRIP_CHARS.sub("", value)
        if not PHONE_PATTERN.fullmatch(normalized):
            raise ValueError(
                "Ingresá un teléfono válido, con código de país si es posible "
                "(ej: +5491122334455)."
            )
        return normalized

    @model_validator(mode="after")
    def passwords_must_match(self) -> "UserCreate":
        if self.password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden.")
        return self


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    role: UserRole
    is_active: bool
    created_at: datetime


class UserStatusUpdate(BaseModel):
    is_active: bool
