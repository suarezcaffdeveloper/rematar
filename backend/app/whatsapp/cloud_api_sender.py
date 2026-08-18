"""`WhatsAppSender` real, contra la WhatsApp Business Cloud API de Meta.

Una conexión nueva por envío (`httpx.AsyncClient` de corta vida, sin pool) -- mismo
criterio que `SmtpEmailSender`: el volumen esperado (un WhatsApp por adjudicación) no
justifica mantener un cliente persistente.

Reintenta en errores transitorios (timeout, error de conexión, 429, 5xx) con un backoff
fijo corto. No reintenta en el resto de los 4xx (token inválido, template no
aprobado/inexistente, número inválido): son errores permanentes que no se arreglan
reintentando, y agregarían latencia y ruido en los logs sin ningún beneficio.
"""

import asyncio
from typing import Any

import httpx
import structlog

from app.core.config import Settings
from app.whatsapp.errors import WhatsAppSendError

logger = structlog.get_logger(__name__)

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = (1.0, 2.0)
_RETRYABLE_STATUS_CODES_MIN = 500


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= _RETRYABLE_STATUS_CODES_MIN


def _extract_meta_error(response: httpx.Response) -> dict[str, Any]:
    try:
        return response.json().get("error", {})
    except ValueError:
        return {}


class CloudApiWhatsAppSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send_template(
        self,
        *,
        to: str,
        body_params: list[str],
        button_param: str,
    ) -> str:
        url = (
            f"https://graph.facebook.com/{self._settings.WHATSAPP_API_VERSION}/"
            f"{self._settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
        )
        headers = {"Authorization": f"Bearer {self._settings.WHATSAPP_ACCESS_TOKEN}"}
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": self._settings.WHATSAPP_TEMPLATE_NAME,
                "language": {"code": self._settings.WHATSAPP_TEMPLATE_LANGUAGE},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": p} for p in body_params],
                    },
                    {
                        "type": "button",
                        "sub_type": "url",
                        "index": "0",
                        "parameters": [{"type": "text", "text": button_param}],
                    },
                ],
            },
        }
        timeout = httpx.Timeout(self._settings.WHATSAPP_API_TIMEOUT_SECONDS)

        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(1, _MAX_ATTEMPTS + 1):
                is_last_attempt = attempt == _MAX_ATTEMPTS
                try:
                    response = await client.post(url, json=payload, headers=headers)
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    if is_last_attempt:
                        logger.error(
                            "whatsapp_api_call_failed",
                            error_kind=type(exc).__name__,
                            attempt=attempt,
                        )
                        raise WhatsAppSendError(
                            f"No se pudo contactar la Cloud API de WhatsApp: {exc}"
                        ) from exc
                    logger.warning(
                        "whatsapp_api_retry", error_kind=type(exc).__name__, attempt=attempt
                    )
                    await asyncio.sleep(_BACKOFF_SECONDS[attempt - 1])
                    continue

                if response.status_code == 200:
                    message_id = response.json()["messages"][0]["id"]
                    logger.info("whatsapp_message_sent", whatsapp_message_id=message_id)
                    return message_id

                if _is_retryable_status(response.status_code) and not is_last_attempt:
                    logger.warning(
                        "whatsapp_api_retry",
                        status_code=response.status_code,
                        attempt=attempt,
                    )
                    await asyncio.sleep(_BACKOFF_SECONDS[attempt - 1])
                    continue

                meta_error = _extract_meta_error(response)
                logger.error(
                    "whatsapp_api_call_failed",
                    status_code=response.status_code,
                    meta_error_code=meta_error.get("code"),
                    meta_error_message=meta_error.get("message"),
                    attempt=attempt,
                )
                raise WhatsAppSendError(
                    f"Meta Cloud API respondió {response.status_code}: "
                    f"{meta_error.get('message', 'error desconocido')}"
                )

        # Inalcanzable: el loop siempre retorna o lanza en el último intento.
        raise WhatsAppSendError("No se pudo enviar el WhatsApp tras agotar los reintentos.")
