"""Resolución de privilegio y enmascarado de eventos de dominio por destinatario.

## Root cause (Fase 1 de remediación del WebSocket Security Audit)

`EventDispatcher.dispatch()` (`app/realtime/dispatcher.py`) arma un único payload
(`event.model_dump(mode="json")`) y lo entrega sin cambios a cada conexión de la sala --
sin ningún concepto de "quién lo está viendo". Algunos eventos llevan campos que sí
tienen control de acceso en su endpoint HTTP equivalente (`buyer_id` en `GET .../ofertas`
-- solo dueño/admin, ver `AuctionEngine.list_history`; `reserve_price` en
`GET .../lotes/{id}` -- solo dueño/admin, ver `LoteService._mask_reserve_price`;
`SnapshotService._mask_oferta`/`_mask_lote` aplican la misma regla al snapshot inicial de
sala), pero, una vez conectado, cualquier evento posterior que mencione esos mismos
campos los entregaba sin enmascarar a toda la sala. Este módulo cierra esa brecha.

## Regla de privilegio

Misma regla de una línea que ya reimplementan, cada uno por su cuenta,
`SnapshotService._is_privileged`, `LoteService._mask_reserve_price`,
`AnalyticsService._is_privileged` y `ModerationService._assert_can_read`: el
destinatario ve el dato completo si es el dueño del remate o un administrador. Acá se
reimplementa una vez más (`is_privileged_viewer`) en vez de importar cualquiera de esas
cuatro -- exactamente el mismo criterio que ya documenta el docstring de
`SnapshotService._is_privileged` ("se reimplementa acá ... para no depender de un
detalle interno de otro módulo; es la misma regla de una línea en los tres lugares"):
sumar acá un quinto import cruzado hacia `app/snapshot/` (o cualquiera de los otros tres)
violaría esa misma disciplina de límites entre módulos sin ganar nada -- es una
comparación de un renglón, no lógica que valga la pena compartir por código.

## Fail closed

Si no se puede resolver el privilegio de un destinatario (remate no encontrado, usuario
no encontrado, sin `session_factory` configurado, error de base de datos) se lo trata
como NO privilegiado: nunca se asume acceso a un campo protegido.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterable
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.models import Remate
from app.modules.users.models import User, UserRole

logger = structlog.get_logger(__name__)


def is_privileged_viewer(*, viewer_role: UserRole, viewer_id: uuid.UUID, owner_id: uuid.UUID) -> bool:
    """Dueño del remate o administrador -- misma regla que `SnapshotService._is_privileged`."""
    return viewer_role == UserRole.ADMIN or viewer_id == owner_id


class RecipientContext:
    """Lo mínimo que hace falta saber de UN destinatario puntual para decidir qué
    payload recibe: su propio id (para que un campo que se refiere a él mismo -- ej. su
    propio `buyer_id` en una oferta que hizo él -- nunca se le oculte a sí mismo) y si es
    privilegiado (dueño del remate o admin) para el remate de este evento."""

    __slots__ = ("viewer_id", "is_privileged")

    def __init__(self, *, viewer_id: uuid.UUID, is_privileged: bool) -> None:
        self.viewer_id = viewer_id
        self.is_privileged = is_privileged


def _hide_unless_self_or_privileged(
    payload: dict[str, Any], field: str, *, recipient: RecipientContext
) -> None:
    """Pone `payload[field]` en `None`, salvo que el destinatario sea privilegiado o el
    valor del campo sea, precisamente, su propio id -- un comprador siempre puede saber
    que UNA oferta es la suya (el mismo dato que ya recibió como respuesta directa de
    `POST .../ofertas`), nunca la identidad de otro comprador."""
    value = payload.get(field)
    if recipient.is_privileged:
        return
    if value is not None and str(value) == str(recipient.viewer_id):
        return
    payload[field] = None


def _masker_for_buyer_field(
    field: str,
) -> Callable[[dict[str, Any], RecipientContext], dict[str, Any]]:
    def _mask(payload: dict[str, Any], recipient: RecipientContext) -> dict[str, Any]:
        masked = dict(payload)
        _hide_unless_self_or_privileged(masked, field, recipient=recipient)
        return masked

    return _mask


def _mask_oferta_winner_changed(
    payload: dict[str, Any], recipient: RecipientContext
) -> dict[str, Any]:
    """`OfertaWinnerChanged` lleva DOS ids de comprador distintos (el superado y el
    nuevo líder) -- cada uno se evalúa contra el destinatario por separado, para que un
    comprador vea el suyo propio en cualquiera de los dos roles sin ver el del otro."""
    masked = dict(payload)
    _hide_unless_self_or_privileged(masked, "previous_buyer_id", recipient=recipient)
    _hide_unless_self_or_privileged(masked, "new_buyer_id", recipient=recipient)
    return masked


def _mask_lote_requeued(payload: dict[str, Any], recipient: RecipientContext) -> dict[str, Any]:
    masked = dict(payload)
    if not recipient.is_privileged:
        masked["reserve_price"] = None
    return masked


# Whitelist explícita -- mismo criterio que `EVENT_REGISTRY` (app/realtime/registry.py):
# un evento nuevo con un campo sensible no queda protegido hasta que alguien lo agregue
# acá a propósito. Resultado de la revisión sistemática de TODOS los eventos de
# `SYNCED_EVENTS` pedida en la Fase 1 del audit -- no solo los cuatro de Oferta ya
# reportados, también se encontró `postauction.case_created` (mismo campo `buyer_id`,
# mismo problema).
MASKERS: dict[str, Callable[[dict[str, Any], RecipientContext], dict[str, Any]]] = {
    "oferta.placed": _masker_for_buyer_field("buyer_id"),
    "oferta.accepted": _masker_for_buyer_field("buyer_id"),
    "oferta.rejected": _masker_for_buyer_field("buyer_id"),
    "oferta.winner_changed": _mask_oferta_winner_changed,
    "lote.winner_determined": _masker_for_buyer_field("buyer_id"),
    "lote.requeued": _mask_lote_requeued,
    "postauction.case_created": _masker_for_buyer_field("buyer_id"),
}

# Eventos que solo deben llegar a destinatarios privilegiados (dueño del remate o
# admin) -- no alcanza con enmascarar un campo, el evento entero no debe entregarse a
# nadie más. `moderacion.umbral_ofertas_invalidas_superado` ya tiene su canal correcto
# hacia el rematador dueño (`NotificationRepository`, ver
# `ModerationService.record_invalid_bid_attempt`, que ya crea una `Notification` con
# `user_id=remate.owner_id`) -- sigue en `SYNCED_EVENTS` únicamente para que el panel de
# moderación del propio dueño, si lo tiene abierto en ese momento, se actualice en vivo
# sin esperar un refetch; nunca para que llegue a nadie más (ver el docstring de
# `ModerationInvalidBidThresholdExceeded`, `app/moderation/events.py`, que ya decía esto
# y no se estaba cumpliendo).
PRIVILEGED_ONLY_EVENTS: frozenset[str] = frozenset(
    {"moderacion.umbral_ofertas_invalidas_superado"}
)

# Unión de ambos -- lo único que le importa a `EventDispatcher` para decidir si necesita
# resolver privilegio en absoluto (evita una consulta a la base para el resto de los
# eventos, que siguen exactamente igual que antes de esta remediación).
PROTECTED_EVENT_TYPES: frozenset[str] = frozenset(MASKERS) | PRIVILEGED_ONLY_EVENTS


def mask_payload_for_recipient(
    event_type: str, payload: dict[str, Any], recipient: RecipientContext
) -> dict[str, Any]:
    """Devuelve el payload que le corresponde a `recipient` para `event_type` -- el
    mismo `payload` sin cambios si el tipo no tiene ningún campo protegido."""
    masker = MASKERS.get(event_type)
    if masker is None:
        return payload
    return masker(payload, recipient)


class RealtimePrivilegeResolver:
    """Resuelve, para UN evento puntual, qué destinatarios de la sala son privilegiados
    -- una única consulta de `Remate` (dueño) + una única consulta batch de `User.role`
    por evento, nunca una consulta por conexión. Mismo patrón de batch ya usado en el
    proyecto para resolver un dato adicional sobre un lote de ids (ver
    `BotIdentityResolver.resolve`, `UserRepository.list_avatars_by_ids`).

    No se reutiliza `RemateRepository`/`UserRepository` tal cual: ambos exponen mucha
    más superficie (CRUD completo) de la que hace falta acá, y ninguno de los dos tiene
    hoy un método de batch de `role` -- agregar uno a `UserRepository` (fuera del
    alcance de `app/realtime/`, explícitamente reservado para otra fase) sería más
    cambio del necesario para esta remediación puntual."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def resolve(
        self, remate_id: uuid.UUID, user_ids: Iterable[uuid.UUID]
    ) -> dict[uuid.UUID, RecipientContext]:
        ids = list(dict.fromkeys(user_ids))  # únicos, preserva orden
        if not ids:
            return {}

        owner_id = await self._get_owner_id(remate_id)
        roles = await self._get_roles(ids)

        contexts: dict[uuid.UUID, RecipientContext] = {}
        for user_id in ids:
            role = roles.get(user_id)
            is_privileged = (
                owner_id is not None
                and role is not None
                and is_privileged_viewer(viewer_role=role, viewer_id=user_id, owner_id=owner_id)
            )
            contexts[user_id] = RecipientContext(viewer_id=user_id, is_privileged=is_privileged)
        return contexts

    async def _get_owner_id(self, remate_id: uuid.UUID) -> uuid.UUID | None:
        try:
            remate = await self._db.get(Remate, remate_id)
        except Exception:
            logger.warning("realtime_privilege_remate_lookup_failed", remate_id=str(remate_id))
            return None
        return remate.owner_id if remate is not None else None

    async def _get_roles(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, UserRole]:
        try:
            stmt = select(User.id, User.role).where(User.id.in_(user_ids))
            rows = (await self._db.execute(stmt)).all()
        except Exception:
            logger.warning("realtime_privilege_role_lookup_failed")
            return {}
        return {row.id: row.role for row in rows}
