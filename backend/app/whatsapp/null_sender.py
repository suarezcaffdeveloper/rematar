"""`WhatsAppSender` de desarrollo -- no manda nada de verdad, solo deja un log. Se usa
cuando falta configurar la Cloud API de Meta (`WHATSAPP_ENABLED=false` o sin
`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`, ver
`app/notify/dependencies.py::_build_whatsapp_sender`), para poder correr el backend
localmente sin credenciales sin que el resto del flujo de adjudicación se vea afectado.
"""

import structlog

logger = structlog.get_logger(__name__)


class NullWhatsAppSender:
    async def send_template(
        self,
        *,
        to: str,
        body_params: list[str],
        button_param: str,
    ) -> str:
        logger.info("whatsapp_send_skipped_null_sender", to=to)
        return "null-sender"
