"""`EmailSender` de desarrollo -- no manda nada de verdad, solo deja un log. Se usa
cuando falta configurar SMTP (`EMAIL_ENABLED=false` o sin `SMTP_HOST`, ver
`app/notify/dependencies.py::_build_email_sender`), para poder correr el backend
localmente sin credenciales sin que el resto del flujo de adjudicación se vea afectado.
"""

import structlog

from app.email.message import EmailMessage

logger = structlog.get_logger(__name__)


class NullEmailSender:
    async def send(self, message: EmailMessage) -> None:
        logger.info("email_send_skipped_null_sender", to=message.to, subject=message.subject)
