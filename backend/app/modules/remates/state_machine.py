"""Máquina de estados de Remate (ver docs/07-maquinas-de-estado.md de Fase 0).

Se aísla en su propio módulo, separado de `service.py`, para que las fases futuras que
agreguen las transiciones que dependen de Lotes (iniciar -> LIVE, pausar/reanudar
<-> PAUSED, finalizar -> FINISHED) reutilicen exactamente esta misma tabla en vez de
reinventarla o, peor, duplicarla con el riesgo de que las dos copias diverjan.

Esta fase (Módulo 2.1) solo llama a `assert_transition_allowed` para dos transiciones:
`DRAFT -> SCHEDULED` y `(no terminal) -> CANCELLED`. Las demás transiciones ya están
modeladas acá correctamente (coinciden con el diagrama de Fase 0) aunque todavía no haya
ningún endpoint que las dispare — RF-08 (docs/03-requisitos-funcionales.md) exige que un
remate solo pueda iniciarse si tiene al menos un lote cargado, y ese Módulo (2.2) todavía
no existe.
"""

from app.core.exceptions import BusinessRuleError
from app.modules.remates.models import RemateStatus

ALLOWED_TRANSITIONS: dict[RemateStatus, frozenset[RemateStatus]] = {
    RemateStatus.DRAFT: frozenset({RemateStatus.SCHEDULED, RemateStatus.CANCELLED}),
    RemateStatus.SCHEDULED: frozenset({RemateStatus.LIVE, RemateStatus.CANCELLED}),
    RemateStatus.LIVE: frozenset(
        {RemateStatus.PAUSED, RemateStatus.FINISHED, RemateStatus.CANCELLED}
    ),
    RemateStatus.PAUSED: frozenset({RemateStatus.LIVE, RemateStatus.CANCELLED}),
    RemateStatus.FINISHED: frozenset(),
    RemateStatus.CANCELLED: frozenset(),
}


def assert_transition_allowed(current: RemateStatus, target: RemateStatus) -> None:
    if target not in ALLOWED_TRANSITIONS[current]:
        raise BusinessRuleError(
            f"No se puede pasar de '{current.value}' a '{target.value}'.",
            current_status=current.value,
            target_status=target.value,
        )
