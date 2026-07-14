"""Modelo de sesión: refresh tokens persistidos.

El `id` (UUID, heredado de `UUIDPrimaryKeyMixin`) de cada fila **es** el `jti` que viaja
dentro del JWT de refresh — no hay una columna `jti` separada, sería un duplicado del
mismo valor. Ver `docs/adr/ADR-011-refresh-tokens-persistidos-en-postgres.md` para el
razonamiento completo (por qué esto existe, por qué no está solo en un JWT stateless, y
por qué se rota en cada uso).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class RefreshToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL mientras la sesión está activa. Se completa al hacer logout o al rotar este
    # token en un /refresh posterior (nunca se borra la fila: queda como registro de
    # auditoría de sesiones, igual que las ofertas rechazadas en RF-25).
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        revoked = self.revoked_at is not None
        return f"<RefreshToken id={self.id} user_id={self.user_id} revoked={revoked}>"
