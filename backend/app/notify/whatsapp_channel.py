"""`NotificationChannel` que envía el WhatsApp de "ganaste el lote" -- compone
`WhatsAppSender` (transporte) con la normalización de teléfonos y el armado del token
firmado del botón, sin que ninguno de esos conozca el detalle del otro. Mismo criterio
que `EmailNotificationChannel` (`app/notify/email_channel.py`)."""

from app.core.config import Settings
from app.email.formatting import format_currency
from app.notify.context import LoteAdjudicadoContext
from app.whatsapp.errors import WhatsAppPhoneInvalidError
from app.whatsapp.phone import normalize_whatsapp_number
from app.whatsapp.redirect_token import build_redirect_token
from app.whatsapp.sender import WhatsAppSender


class WhatsAppNotificationChannel:
    name = "whatsapp"

    def __init__(self, sender: WhatsAppSender, settings: Settings) -> None:
        self._sender = sender
        self._settings = settings

    async def notify_lote_adjudicado(self, context: LoteAdjudicadoContext) -> None:
        buyer_number = normalize_whatsapp_number(context.buyer_phone, self._settings)
        if buyer_number is None:
            raise WhatsAppPhoneInvalidError(
                "El comprador no tiene teléfono registrado o es inválido."
            )

        rematador_number = normalize_whatsapp_number(context.rematador_phone, self._settings)
        if rematador_number is None:
            raise WhatsAppPhoneInvalidError(
                "El rematador no tiene teléfono registrado o es inválido."
            )

        token = build_redirect_token(
            case_id=context.case_id,
            rematador_phone=rematador_number,
            lot_number=context.lot_number,
            settings=self._settings,
        )

        await self._sender.send_template(
            to=buyer_number,
            body_params=[
                context.buyer_name,
                context.lot_number,
                context.remate_title,
                format_currency(context.final_price, context.currency),
                context.rematador_name,
            ],
            button_param=token,
        )
