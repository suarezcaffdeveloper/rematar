"""Un canal de notificación al ganador de un lote -- email hoy, WhatsApp/push después.
Agregar un canal nuevo implica implementar este `Protocol` y registrarlo en
`dependencies.py::build_notification_service`; ni `PostAuctionService` ni el resto del
dominio necesitan cambiar.

`notify_lote_adjudicado` puede lanzar -- es `NotificationService` (`service.py`) quien
atrapa el error de cada canal, no el canal mismo."""

from typing import Protocol

from app.notify.context import LoteAdjudicadoContext


class NotificationChannel(Protocol):
    name: str

    async def notify_lote_adjudicado(self, context: LoteAdjudicadoContext) -> None: ...
