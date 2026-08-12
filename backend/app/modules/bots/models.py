"""Modelos del módulo de bots simuladores de compradores.

Un `BotProfile` es una configuración reutilizable entre remates (nombre visible,
personalidad, presupuesto, tiempos de reacción, participación en chat). Cada perfil
tiene un `User` real 1:1 (`user_id`, rol `comprador`) que actúa como "backing user":
es lo que permite que `AuctionEngine.place_bid`/`ChatService.send_message` (que asumen
en todo su código que `buyer_id`/`author_id` es siempre un `User` real) sigan
funcionando exactamente igual, sin ninguna rama especial para bots. `bot_profiles` es
la única fuente de verdad de "este `user_id` es un simulador" — nada se agrega a la
tabla `users`.

`BotRemateSelection` es la relación N:M "qué bots participan en qué remate" (con un
`is_enabled` para poder togglear un bot sin sacarlo de la selección). `BotSimulationRun`
es el control de ejecución -- deliberadamente uno por remate, no por lote: el enunciado
pide un único Iniciar/Pausar/Detener por remate, igual que `RematePaused` ya "congela"
cualquier lote `OPEN` sin necesitar un `PAUSED` propio de `Lote` (ver docstring de
`app/modules/remates/lotes/models.py`). Qué lote específico está recibiendo reacciones
en un momento dado no se persiste acá: lo aprende en memoria el `RemateBotRunner`
(`app/modules/bots/runner.py`) a partir de los eventos `lote.opened`/`lote.closed`, el
mismo criterio que ya usa el frontend para reconstruir `active_lote`.
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class BotPersonality(str, enum.Enum):
    """Ver `app/modules/bots/strategy.py` para cómo cada personalidad traduce a montos
    de oferta y mensajes de chat concretos."""

    CONSERVATIVE = "conservative"
    COMPETITIVE = "competitive"
    AGGRESSIVE = "aggressive"


class BotSimulationStatus(str, enum.Enum):
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class BotProfile(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "bot_profiles"
    __table_args__ = (
        CheckConstraint("max_budget > 0", name="max_budget_positive"),
        CheckConstraint(
            "reaction_delay_min_seconds > 0", name="reaction_delay_min_seconds_positive"
        ),
        CheckConstraint(
            "reaction_delay_max_seconds >= reaction_delay_min_seconds",
            name="reaction_delay_max_gte_min",
        ),
        CheckConstraint(
            "continue_probability >= 0 AND continue_probability <= 1",
            name="continue_probability_between_0_and_1",
        ),
        CheckConstraint(
            "chat_message_frequency >= 0 AND chat_message_frequency <= 1",
            name="chat_message_frequency_between_0_and_1",
        ),
    )

    # RESTRICT: mismo criterio que Remate.owner_id -- un bot con historial de
    # participación no debería poder desaparecer por CASCADE si el rematador dueño se
    # elimina (todavía no existe esa funcionalidad, pero el criterio queda preparado).
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # El `User` backing (rol comprador) que `AuctionEngine`/`ChatService` ven como
    # cualquier otro comprador real -- ver docstring del módulo.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )

    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    personality: Mapped[BotPersonality] = mapped_column(
        Enum(
            BotPersonality,
            name="bot_personality",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
    )
    max_budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reaction_delay_min_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    reaction_delay_max_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    continue_probability: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    participates_in_chat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    chat_message_frequency: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), nullable=False, default=Decimal("0")
    )
    # Kill-switch: un bot inactivo nunca se ofrece como candidato al seleccionar
    # participantes de un remate nuevo, aunque siga en selecciones ya guardadas.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<BotProfile id={self.id} display_name={self.display_name!r}>"


class BotRemateSelection(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bot_remate_selections"
    __table_args__ = (
        UniqueConstraint(
            "remate_id", "bot_profile_id", name="uq_bot_remate_selections_remate_id_bot_profile_id"
        ),
    )

    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    bot_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bot_profiles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return (
            f"<BotRemateSelection remate_id={self.remate_id} "
            f"bot_profile_id={self.bot_profile_id}>"
        )


class BotSimulationRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Único por remate (`UNIQUE` sobre `remate_id`) -- ver docstring del módulo."""

    __tablename__ = "bot_simulation_runs"

    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    status: Mapped[BotSimulationStatus] = mapped_column(
        Enum(
            BotSimulationStatus,
            name="bot_simulation_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=BotSimulationStatus.STOPPED,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # "manual" | "process_restart" | "remate_finished" | "remate_cancelled"
    stop_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<BotSimulationRun remate_id={self.remate_id} status={self.status.value}>"
