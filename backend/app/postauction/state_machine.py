"""Máquina de estados del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

A diferencia de `Lote`/`Remate` (transiciones puntuales entre un conjunto acotado de
estados vecinos), acá el flujo es una secuencia lineal donde se permite avanzar a
**cualquier estado posterior** en un solo paso, nunca retroceder: el rematador puede saltar
pasos (ej. el comprador ya pagó antes de que se registrara el contacto), pero nunca puede
"des-adjudicar" ni volver a un estado anterior. `ALLOWED_TRANSITIONS` se construye a partir
de `STATUS_ORDER` en vez de escribirse a mano, para que agregar un estado nuevo el día de
mañana sea una única línea en la lista, no un dict entero.
"""

from app.core.exceptions import BusinessRuleError
from app.postauction.models import PostAuctionStatus

STATUS_ORDER: tuple[PostAuctionStatus, ...] = (
    PostAuctionStatus.ADJUDICADO,
    PostAuctionStatus.PENDIENTE_CONTACTO,
    PostAuctionStatus.PAGO_PENDIENTE,
    PostAuctionStatus.PAGO_RECIBIDO,
    PostAuctionStatus.PREPARANDO_ENTREGA,
    PostAuctionStatus.ENVIADO,
    PostAuctionStatus.ENTREGADO,
    PostAuctionStatus.FINALIZADO,
)

ALLOWED_TRANSITIONS: dict[PostAuctionStatus, frozenset[PostAuctionStatus]] = {
    status: frozenset(STATUS_ORDER[index + 1 :]) for index, status in enumerate(STATUS_ORDER)
}

# Estado "de llegada" -> columna de fecha hito que se estampa al alcanzarlo (si todavía
# no tenía valor) -- ver `PostAuctionService.change_status`. `ADJUDICADO` y
# `PENDIENTE_CONTACTO` no tienen hito propio: son los estados de arranque, sin nada que
# "confirmar" todavía.
STATUS_MILESTONE_FIELD: dict[PostAuctionStatus, str] = {
    PostAuctionStatus.PAGO_PENDIENTE: "contacted_at",
    PostAuctionStatus.PAGO_RECIBIDO: "payment_at",
    PostAuctionStatus.ENVIADO: "shipped_at",
    PostAuctionStatus.ENTREGADO: "delivered_at",
    PostAuctionStatus.FINALIZADO: "finalized_at",
}


def assert_transition_allowed(current: PostAuctionStatus, target: PostAuctionStatus) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise BusinessRuleError(
            f"No se puede pasar de '{current.value}' a '{target.value}'.",
            current_status=current.value,
            target_status=target.value,
        )
