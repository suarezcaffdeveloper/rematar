"""Email de confirmación cuando una garantía económica queda `ACTIVE` (hold autorizado
por Mercado Pago).

Deliberadamente separado de `NotificationService`/`NotificationChannel` (`app/notify/`),
mismo criterio que `AuthEmailNotifier` (`app/modules/auth/notifications.py`): no hace
falta WhatsApp acá, y no hay timeline de negocio post-remate donde dejar el resultado por
canal -- alcanza con componer `EmailSender`/`EmailTemplateRenderer` directamente.

Mismo criterio best-effort que el resto de los notifiers del proyecto: nunca lanza, solo
loguea si falla -- un email caído no puede tumbar `GarantiaService.create_or_retry`, que
ya persistió el hold autorizado en Mercado Pago antes de que esto se llame."""

from datetime import UTC, datetime
from decimal import Decimal

import structlog

from app.email.formatting import format_currency, format_date_es
from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender

logger = structlog.get_logger(__name__)


class GarantiaEmailNotifier:
    def __init__(self, sender: EmailSender, renderer: EmailTemplateRenderer) -> None:
        self._sender = sender
        self._renderer = renderer

    async def send_garantia_autorizada(
        self,
        *,
        to: str,
        to_name: str,
        remate_title: str,
        amount: Decimal,
        currency: str,
        authorized_at: datetime,
        expires_at: datetime | None,
    ) -> None:
        html = self._renderer.render(
            "garantia_autorizada.html",
            {
                "buyer_name": to_name,
                "remate_title": remate_title,
                "amount": format_currency(amount, currency),
                "authorized_at": format_date_es(authorized_at),
                "expires_at": format_date_es(expires_at) if expires_at else None,
                "current_year": datetime.now(UTC).year,
            },
        )
        try:
            await self._sender.send(
                EmailMessage(
                    to=to,
                    to_name=to_name,
                    subject=f"Garantía autorizada - {remate_title}",
                    html_body=html,
                )
            )
        except Exception:
            logger.exception("garantia_autorizada_email_failed", to=to)
