"""Mutadores puros de timer de lote, compartidos entre `TimerService` (acciones del
rematador sobre UN lote puntual, ver `app/timer/service.py`) y `RemateService.pause`/
`resume` (que, para un remate TIMED, aplican la misma mecánica a TODOS los lotes
abiertos a la vez al pausar/reanudar el remate completo -- ver plan de Timed Auctions,
sección "Manejo temporal").

Viven en este módulo neutral, no en ninguno de los dos servicios, porque `TimerService`
ya importa `RemateService` (necesita `get_owned_or_raise` para las acciones del
rematador) -- que `RemateService` importara de vuelta a `TimerService` para reusar esta
lógica crearía un ciclo. Ninguno de los dos módulos de servicio depende del otro; ambos
dependen de este.
"""

from datetime import UTC, datetime, timedelta

from app.modules.remates.lotes.models import Lote


def freeze_lote_timer(lote: Lote, *, now: datetime | None = None) -> int | None:
    """Congela el timer en curso de `lote` (si tiene uno) -- `timer_ends_at` pasa a
    `timer_paused_remaining_seconds`, igual que `TimerService.pause`. Devuelve los
    segundos restantes, o `None` sin tocar nada si el lote no tenía un timer corriendo
    (ya estaba pausado, o nunca tuvo uno)."""
    if lote.timer_ends_at is None:
        return None
    now = now or datetime.now(UTC)
    remaining = max(0, int((lote.timer_ends_at - now).total_seconds()))
    lote.timer_paused_remaining_seconds = remaining
    lote.timer_ends_at = None
    return remaining


def unfreeze_lote_timer(lote: Lote, *, now: datetime | None = None) -> datetime | None:
    """Inversa de `freeze_lote_timer` -- reanuda con el tiempo restante que tenía
    congelado, igual que `TimerService.resume`. Devuelve el nuevo deadline absoluto, o
    `None` sin tocar nada si el lote no estaba pausado."""
    if lote.timer_paused_remaining_seconds is None:
        return None
    now = now or datetime.now(UTC)
    ends_at = now + timedelta(seconds=lote.timer_paused_remaining_seconds)
    lote.timer_ends_at = ends_at
    lote.timer_paused_remaining_seconds = None
    return ends_at
