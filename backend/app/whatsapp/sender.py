"""Contrato de envío de WhatsApp. Mismo criterio que `EmailSender`
(`app/email/sender.py`): un `Protocol` del que depende `app/notify/whatsapp_channel.py`,
nunca de una implementación concreta.

`WhatsAppSender.send_template` SÍ puede lanzar (`WhatsAppSendError`) -- quien orquesta
el envío (`NotificationService`) es responsable de atraparlo, no el sender.
"""

from typing import Protocol


class WhatsAppSender(Protocol):
    async def send_template(
        self,
        *,
        to: str,
        body_params: list[str],
        button_param: str,
    ) -> str:
        """Envía la plantilla Utility configurada (`WHATSAPP_TEMPLATE_NAME`) al número
        `to` (ya normalizado, solo dígitos con código de país, sin `+`).

        `body_params` son los valores de `{{1}}..{{n}}` del cuerpo del mensaje, en
        orden. `button_param` es el valor del `{{1}}` del botón de URL dinámica (el
        token firmado de `app/whatsapp/redirect_token.py`).

        Devuelve el id de mensaje que asigna WhatsApp (`messages[0].id`), útil para
        correlacionar en logs y en el dashboard de Meta.
        """
        ...
