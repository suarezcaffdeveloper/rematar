"""`EmailSender` sobre SMTP genérico -- funciona con Gmail (usando una "Contraseña de
aplicación", ver `.env.example`) o con cualquier otro proveedor SMTP estándar
(SendGrid, Mailgun, Amazon SES, etc. exponen todos un endpoint SMTP compatible).

Una conexión nueva por envío (`aiosmtplib.send`, sin pool): el volumen esperado de esta
primera etapa (un email por adjudicación) no justifica mantener conexiones SMTP
persistentes.
"""

from email.message import EmailMessage as MimeEmailMessage

import aiosmtplib

from app.core.config import Settings
from app.email.message import EmailMessage


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, message: EmailMessage) -> None:
        mime_message = MimeEmailMessage()
        mime_message["From"] = f"{self._settings.EMAIL_FROM_NAME} <{self._settings.EMAIL_FROM}>"
        mime_message["To"] = (
            f"{message.to_name} <{message.to}>" if message.to_name else message.to
        )
        mime_message["Subject"] = message.subject

        if message.text_body:
            mime_message.set_content(message.text_body)
            mime_message.add_alternative(message.html_body, subtype="html")
        else:
            mime_message.set_content(message.html_body, subtype="html")

        await aiosmtplib.send(
            mime_message,
            hostname=self._settings.SMTP_HOST,
            port=self._settings.SMTP_PORT,
            username=self._settings.SMTP_USERNAME,
            password=self._settings.SMTP_PASSWORD,
            start_tls=self._settings.SMTP_USE_TLS,
            timeout=self._settings.SMTP_TIMEOUT_SECONDS,
        )
