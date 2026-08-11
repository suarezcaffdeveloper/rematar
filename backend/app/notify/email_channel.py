"""`NotificationChannel` que envía el email de "ganaste el lote" -- compone
`EmailSender` (transporte) y `EmailTemplateRenderer` (HTML) sin conocer ninguno de los
dos en detalle. Un email nuevo (bienvenida, recuperación de contraseña) en el futuro es
un método más acá, no un canal nuevo."""

from app.email.formatting import format_currency, format_date_es
from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender
from app.notify.context import LoteAdjudicadoContext


class EmailNotificationChannel:
    name = "email"

    def __init__(self, sender: EmailSender, renderer: EmailTemplateRenderer) -> None:
        self._sender = sender
        self._renderer = renderer

    async def notify_lote_adjudicado(self, context: LoteAdjudicadoContext) -> None:
        html = self._renderer.render(
            "lote_adjudicado.html",
            {
                "buyer_name": context.buyer_name,
                "remate_title": context.remate_title,
                "lote_title": context.lote_title,
                "lot_number": context.lot_number,
                "final_price": format_currency(context.final_price, context.currency),
                "adjudicated_at": format_date_es(context.adjudicated_at),
                "rematador_name": context.rematador_name,
                "lote_image_url": None,
                "current_year": context.adjudicated_at.year,
            },
        )
        await self._sender.send(
            EmailMessage(
                to=context.buyer_email,
                to_name=context.buyer_name,
                subject=f"¡Ganaste el Lote #{context.lot_number}! - {context.remate_title}",
                html_body=html,
            )
        )
