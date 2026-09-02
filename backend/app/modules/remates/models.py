"""Modelo de Remate (Épica 2, Módulo 2.1).

Deliberadamente sin relación con Lotes/Ofertas todavía: el remate existe como entidad
completa aunque no tenga lotes cargados. Tampoco hay una relación SQLAlchemy
(`relationship`) hacia `User` — `owner_id` es una FK simple. Un módulo puede referenciar
la fila de otro por id sin acoplarse a su grafo de objetos ORM; eso es justamente lo que
mantiene los límites de módulo de ADR-001 (Fase 0) reales en el código, no solo en un
diagrama. Si una fase futura necesita traer datos del dueño junto con el remate (para no
pagar una consulta aparte), esa es una decisión de rendimiento a tomar en ese momento,
no algo que valga la pena pagar en acoplamiento hoy sin un caso de uso concreto.

`RemateCategory` y `RemateStatus` son ENUMs nativos de PostgreSQL, siguiendo el mismo
patrón que `UserRole` (ver ADR-010 de Fase 1). Detalle y trade-offs de cada uno en
ADR-012 (configuración como JSONB) y ADR-013 (categoría como enum) de esta fase.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class RemateStatus(str, enum.Enum):
    """Ver docs/07-maquinas-de-estado.md. Esta fase solo implementa las transiciones
    DRAFT -> SCHEDULED y (cualquiera no terminal) -> CANCELLED — ver
    app/modules/remates/state_machine.py para el porqué de LIVE/PAUSED/FINISHED
    quedar sin transición expuesta todavía."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    LIVE = "live"
    PAUSED = "paused"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class RemateCategory(str, enum.Enum):
    """Categorías alineadas con los rubros exhibidos en la landing pública (ver ADR-013).
    Los nombres de los miembros reflejan agrupaciones amplias de mercado; los valores se
    mantienen en snake_case para consistencia con URLs y JSON histórico."""

    INMUEBLES = "inmuebles"
    VEHICULOS = "vehiculos"
    MAQUINARIA_PESADA_Y_AGRICOLA = "maquinaria_pesada_y_agricola"
    HACIENDA = "hacienda"
    ARTE_ANTIGUEDADES_Y_COLECCIONABLES = "arte_antiguedades_y_coleccionables"
    JOYAS_RELOJERIA_Y_NUMISMATICA = "joyas_relojeria_y_numismatica"
    TECNOLOGIA_ELECTRODOMESTICOS_Y_HOGAR = "tecnologia_electrodomesticos_y_hogar"
    NAUTICA_Y_AVIACION = "nautica_y_aviacion"
    MERCADERIA_E_INDUMENTARIA = "mercaderia_e_indumentaria"


class RemateAccessType(str, enum.Enum):
    """Remates privados: mismo remate, misma sala, mismo motor de pujas -- lo único que
    cambia es cómo se llega. Ver RemateService.redeem_private_access /
    RemateAccessGrant. Elegible solo al crear (RemateCreate), no editable después."""

    PUBLIC = "public"
    PRIVATE = "private"


# Valor por defecto de `Remate.settings` (ver ADR-012). Vive acá, no en schemas.py, para
# que el modelo ORM tenga un default coherente incluso si algo lo instancia sin pasar
# por RemateCreate (ej. un script, una migración de datos).
DEFAULT_REMATE_SETTINGS: dict = {
    "anti_sniping_enabled": False,
    "anti_sniping_extension_seconds": 60,
    "currency": "ARS",
    # Segundos de cuenta regresiva por lote al abrirlo -- `None` es "sin timer" (opt-in,
    # Épica 8, Módulo "cuenta regresiva y cierre automático"). Ver ADR-007/ADR-043.
    "lote_timer_seconds": None,
}


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum (ej. "rematador"), no el
    nombre del miembro (ej. "REMATADOR") — mismo detalle que en `users/models.py`."""
    return [member.value for member in enum_cls]


class Remate(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "remates"
    __table_args__ = (
        # Nombre sin el prefijo "ck_remates_": la naming_convention de Base (ver
        # app/db/base_class.py) ya lo agrega — pasarlo acá también lo duplicaba
        # (se detectó en el SQL generado por el primer autogenerate de esta migración).
        CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
            name="ends_at_after_starts_at",
        ),
        Index("ix_remates_status_starts_at", "status", "starts_at"),
    )

    # RESTRICT, no CASCADE: a diferencia de una sesión (refresh_tokens, que sí cascadea
    # en Fase 1), un remate es un registro de negocio con valor de auditoría propio. No
    # existe hoy ningún endpoint que borre un usuario, pero si alguna vez existiera, no
    # debería poder llevarse puestos los remates que ese usuario haya creado.
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Operador en vivo asignado por la empresa dueña (ver ADR-048). A diferencia de
    # `owner_id`, es SET NULL: si el usuario rematador desaparece, el remate no debería
    # quedar bloqueado -- la empresa simplemente vuelve a generar un código y asigna a
    # otro. Un rematador nunca puede ser `owner_id` (eso ahora es exclusivo de `empresa`).
    rematador_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Nunca se persiste el código en texto plano (mismo criterio que una contraseña,
    # aunque acá alcanza con un hash rápido -- no es un secreto de alto valor sujeto a
    # ataques de fuerza bruta offline, es un código corto que la empresa comparte una
    # vez con el rematador). Regenerar el código sobreescribe este hash y limpia
    # `rematador_id` en la misma operación (ver `RemateService.generate_operator_code`).
    operator_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operator_code_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Remates privados: elegido solo al crear (ver RemateCreate/RemateService.create), no
    # editable después. PUBLIC es el default para no alterar el comportamiento de ningún
    # remate existente ni de ningún flujo que no mande el campo.
    access_type: Mapped[RemateAccessType] = mapped_column(
        Enum(
            RemateAccessType,
            name="remate_access_type",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=RemateAccessType.PUBLIC,
    )
    # A diferencia de operator_code_hash, este campo se guarda CIFRADO (reversible, ver
    # app/core/crypto.py), no hasheado: el dueño necesita poder volver a ver el código
    # actual (card del dashboard, sala en vivo) sin regenerarlo -- un hash irreversible
    # obligaría a "regenerar" cada vez que quiere volver a copiarlo, invalidándolo para
    # quien todavía no lo canjeó. Sigue sin ser un secreto de alto valor (código corto
    # que la empresa comparte por WhatsApp/email), por eso alcanza cifrado simétrico con
    # la SECRET_KEY de la app en vez de un esquema de claves por remate.
    # A diferencia de operator_code, regenerar NO limpia ningún otro campo -- este código
    # es un canal de invitación compartido (varios compradores pueden canjearlo), no una
    # asignación exclusiva 1:1, así que regenerar no debe revocar los accesos ya
    # otorgados (ver RemateAccessGrant).
    private_access_code_encrypted: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    private_access_code_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[RemateCategory] = mapped_column(
        Enum(
            RemateCategory,
            name="remate_category",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Opcionales en DRAFT; `starts_at` pasa a ser obligatorio recién para programar (ver
    # RemateService.schedule). `ends_at` es siempre opcional (pedido explícito).
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[RemateStatus] = mapped_column(
        Enum(
            RemateStatus,
            name="remate_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=RemateStatus.DRAFT,
    )

    settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: dict(DEFAULT_REMATE_SETTINGS)
    )

    # Auditoría de la transición a CANCELLED. `cancellation_reason` existe porque RF-11
    # (Fase 0) exige motivo obligatorio al cancelar; se guarda en la propia fila en vez
    # de una tabla de auditoría aparte porque un remate tiene, a lo sumo, una cancelación
    # en su vida — no hace falta un historial de múltiples cancelaciones.
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Se completa recién cuando exista la transición a FINISHED (depende de Lotes, ver
    # state_machine.py); la columna ya existe para no requerir otra migración ese día.
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Remate id={self.id} title={self.title!r} status={self.status.value}>"


class RemateAccessGrant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Un comprador que canjeó el código de acceso de un remate PRIVATE (ver
    RemateService.redeem_private_access) queda con acceso persistente a ESE remate
    puntual -- sin esto, conocer la URL + código una vez alcanzaría solo para esa
    sesión; recargar la página o reconectar el WebSocket exigiría re-tipear el código
    cada vez.

    No es una lista de invitados (fuera de alcance): no hay aprobación, no expira, y no
    se revoca al regenerar el código (ver Remate.private_access_code_encrypted).
    `RemateRepository.list_for_viewer` (el listado GENERAL de remates disponibles) NUNCA
    consulta esta tabla -- un remate privado sigue sin aparecer ahí incluso para alguien
    con un grant vigente; el grant afecta la visibilidad puntual de detalle/sala
    (RemateService._is_visible / get_visible_or_raise) y, aparte, alimenta una vista de
    autoservicio deliberadamente separada (`list_granted_for_user`, consumida por
    "Ingresar a remate privado" / RedeemPrivateAccessPage) para que un comprador pueda
    volver a entrar a un remate que ya canjeó sin re-tipear el código."""

    __tablename__ = "remate_access_grants"
    __table_args__ = (
        UniqueConstraint(
            "remate_id", "user_id", name="uq_remate_access_grants_remate_id_user_id"
        ),
    )

    # CASCADE, a diferencia de owner_id (RESTRICT) más arriba: un grant es membresía
    # descartable sin valor de auditoría propio (el registro de negocio es el remate en
    # sí, no quién tiene acceso a verlo) -- mismo criterio que refresh_tokens.
    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<RemateAccessGrant remate_id={self.remate_id} user_id={self.user_id}>"
