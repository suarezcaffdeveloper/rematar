"""`NotificationService` orquesta el envío a través de todos los canales configurados
(hoy: email; mañana: WhatsApp) -- mismo contrato de "mejor esfuerzo, nunca lanza" que
`EventBus.publish` (`app/events/bus.py`): un canal que falla nunca puede interrumpir la
operación de negocio que ya se confirmó en la base -- la venta adjudicada ya existe
antes de que esto se llame, ver `PostAuctionService.create_case_from_winner`.

Devuelve el resultado por canal (no lo esconde) para que el llamador pueda dejar
trazabilidad -- `create_case_from_winner` registra un `PostAuctionTimelineEntry` por
resultado, reutilizando el timeline que ya existe en vez de agregar una tabla nueva.
"""

from collections.abc import Sequence

import structlog

from app.notify.channel import NotificationChannel
from app.notify.context import LoteAdjudicadoContext
from app.notify.result import NotificationResult

logger = structlog.get_logger(__name__)


class NotificationService:
    def __init__(self, channels: Sequence[NotificationChannel]) -> None:
        self._channels = channels

    async def notify_lote_adjudicado(
        self, context: LoteAdjudicadoContext
    ) -> list[NotificationResult]:
        results: list[NotificationResult] = []
        for channel in self._channels:
            try:
                await channel.notify_lote_adjudicado(context)
            except Exception as exc:
                logger.exception(
                    "notification_channel_failed",
                    channel=channel.name,
                    notification_type="lote_adjudicado",
                    case_id=str(context.case_id),
                    lote_id=str(context.lote_id),
                )
                results.append(
                    NotificationResult(channel=channel.name, success=False, error=str(exc))
                )
                continue

            logger.info(
                "notification_channel_sent",
                channel=channel.name,
                notification_type="lote_adjudicado",
                case_id=str(context.case_id),
                lote_id=str(context.lote_id),
            )
            results.append(NotificationResult(channel=channel.name, success=True))
        return results
