"""Máquina de estados de Lote (ver docs/07-maquinas-de-estado.md de Fase 0).

Se aísla en su propio módulo, separado de `service.py`, mismo motivo que
`remates/state_machine.py`: el módulo de Ofertas, cuando implemente abrir/cerrar/cancelar
un lote, reutiliza exactamente esta tabla en vez de reinventarla.

Este módulo (2.2) no llama a `assert_transition_allowed` desde ningún lado todavía — todo
lote se crea directamente en `PENDING` y no hay ningún endpoint que dispare una
transición. La tabla ya modela las cinco transiciones completas (coinciden con el
diagrama de Fase 0) para que agregarlas sea, en el módulo de Ofertas, solo agregar
métodos de servicio nuevos que llamen a esta función, no rediseñar la máquina de estados.
"""

from app.core.exceptions import BusinessRuleError
from app.modules.remates.lotes.models import LoteStatus

ALLOWED_TRANSITIONS: dict[LoteStatus, frozenset[LoteStatus]] = {
    LoteStatus.PENDING: frozenset({LoteStatus.OPEN, LoteStatus.CANCELLED}),
    LoteStatus.OPEN: frozenset(
        {LoteStatus.CLOSED_SOLD, LoteStatus.CLOSED_UNSOLD, LoteStatus.CANCELLED}
    ),
    LoteStatus.CLOSED_SOLD: frozenset(),
    LoteStatus.CLOSED_UNSOLD: frozenset(),
    LoteStatus.CANCELLED: frozenset(),
}


def assert_transition_allowed(current: LoteStatus, target: LoteStatus) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise BusinessRuleError(
            f"No se puede pasar de '{current.value}' a '{target.value}'.",
            current_status=current.value,
            target_status=target.value,
        )
