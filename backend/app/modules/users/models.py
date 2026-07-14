"""Modelo de usuario.

`UserRole` se mapea a un ENUM nativo de PostgreSQL, no a texto libre — la razón completa,
alternativas consideradas y el trade-off aceptado (migraciones manuales al agregar un rol
nuevo) están en `docs/adr/ADR-010-enum-nativo-de-roles-en-postgres.md`.
"""

import enum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UserRole(str, enum.Enum):
    """Exactamente estos tres roles (RF-02). Ver docs/02-roles-y-casos-de-uso.md."""

    ADMIN = "admin"
    REMATADOR = "rematador"
    COMPRADOR = "comprador"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    # Habilita RF-03 (el admin puede suspender una cuenta) sin borrar el usuario ni su
    # historial: un usuario inactivo simplemente no puede autenticarse (ver
    # app/modules/auth/service.py).
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"
