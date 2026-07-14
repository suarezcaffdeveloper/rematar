"""Schemas Pydantic del módulo de usuarios.

`UserCreate.role` restringe explícitamente qué roles se pueden auto-asignar por registro
público: nunca `admin`. Una cuenta de administrador se crea exclusivamente vía
`app/scripts/create_superuser.py` (ver README) — permitir `role=admin` en el body de un
POST público sería una escalada de privilegios trivial.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.modules.users.models import UserRole

PUBLICLY_REGISTERABLE_ROLES = {UserRole.REMATADOR, UserRole.COMPRADOR}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
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


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class UserStatusUpdate(BaseModel):
    is_active: bool
