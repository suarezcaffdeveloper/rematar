"""Adapter de Mercado Pago -- único punto del proyecto que habla HTTP con su API de
Pagos (Checkout API, captura diferida). Mismo criterio estructural que
`app/whatsapp/cloud_api_sender.py`/`app/email/smtp_sender.py`: un `Protocol`
(`MercadoPagoClient`) del que depende `GarantiaService`, una implementación real
(`RealMercadoPagoClient`) y una nula para desarrollo sin credenciales
(`NullMercadoPagoClient`, ver `MERCADOPAGO_ENABLED` en `core/config.py`).

Referencia (verificar contra la documentación vigente de Mercado Pago Argentina antes de
producción -- puede cambiar):
- Crear el hold: `POST /v1/payments` con `capture: false` -- el pago queda en estado
  `authorized` sin haber cobrado nada.
- Capturar (total o parcial): `PUT /v1/payments/{id}` con `capture: true` (y
  `transaction_amount` para captura parcial).
- Liberar: `PUT /v1/payments/{id}` con `status: cancelled` -- solo válido mientras el
  pago está `authorized`.
- Consultar: `GET /v1/payments/{id}`.

`create_hold` recibe `card_payment_data` tal cual lo arma el Payment Brick en el
frontend (`token`, `payment_method_id`, `issuer_id`, `installments`, `payer`, ...) --
este adapter nunca ve ni valida un número de tarjeta crudo, solo reenvía el token que ya
tokenizó el navegador."""

import asyncio
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Protocol

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger(__name__)

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = (1.0, 2.0)


class MercadoPagoError(Exception):
    """La operación contra la API de Mercado Pago falló -- red, timeout, o un error
    HTTP que no es "tarjeta rechazada" (eso sí es una respuesta 2xx con
    `status=rejected`, no una excepción -- ver `MercadoPagoPaymentResult`)."""


@dataclass(frozen=True, slots=True)
class MercadoPagoPaymentResult:
    payment_id: str
    status: str
    status_detail: str | None
    raw: dict[str, Any] = field(default_factory=dict)


class MercadoPagoClient(Protocol):
    async def create_hold(
        self,
        *,
        amount: Decimal,
        currency: str,
        description: str,
        external_reference: str,
        payer_email: str,
        card_payment_data: dict[str, Any],
    ) -> MercadoPagoPaymentResult:
        """Crea el pago con `capture=false` (preautorización/hold)."""
        ...

    async def capture(
        self, payment_id: str, *, amount: Decimal | None = None
    ) -> MercadoPagoPaymentResult:
        """Captura el hold -- `amount=None` captura el monto íntegro autorizado."""
        ...

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        """Libera el hold (cancela el pago mientras está `authorized`)."""
        ...

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        """Consulta el estado actual -- usado para reconciliar (nunca confiar
        ciegamente en el body de un webhook, ver `GarantiaService.reconcile`)."""
        ...


class NullMercadoPagoClient:
    """Se usa cuando `MERCADOPAGO_ENABLED=false` (o sin `MERCADOPAGO_ACCESS_TOKEN`) --
    rechaza toda operación con un error claro en vez de intentar hablar con una API sin
    configurar, mismo criterio que `NullEmailSender`/`NullWhatsAppSender` (que sí
    "envían" en silencio); acá no hay un equivalente inocuo a "no hacer nada" porque un
    hold de tarjeta que nunca se crea rompería el flujo de garantía de forma visible
    para el comprador -- mejor un error explícito que uno silencioso."""

    async def create_hold(self, **kwargs: Any) -> MercadoPagoPaymentResult:
        logger.warning("mercadopago_disabled_create_hold_rejected")
        raise MercadoPagoError(
            "La integración con Mercado Pago no está configurada en este entorno."
        )

    async def capture(self, payment_id: str, **kwargs: Any) -> MercadoPagoPaymentResult:
        logger.warning("mercadopago_disabled_capture_rejected", payment_id=payment_id)
        raise MercadoPagoError(
            "La integración con Mercado Pago no está configurada en este entorno."
        )

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        logger.warning("mercadopago_disabled_cancel_rejected", payment_id=payment_id)
        raise MercadoPagoError(
            "La integración con Mercado Pago no está configurada en este entorno."
        )

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        logger.warning("mercadopago_disabled_get_status_rejected", payment_id=payment_id)
        raise MercadoPagoError(
            "La integración con Mercado Pago no está configurada en este entorno."
        )


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


def _parse_result(response: httpx.Response) -> MercadoPagoPaymentResult:
    body = response.json()
    return MercadoPagoPaymentResult(
        payment_id=str(body["id"]),
        status=body["status"],
        status_detail=body.get("status_detail"),
        raw=body,
    )


class RealMercadoPagoClient:
    """Una conexión nueva por operación -- mismo criterio que `SmtpEmailSender`/
    `CloudApiWhatsAppSender`: el volumen esperado (holds de garantía, no cada puja) no
    justifica un cliente persistente. Reintenta en errores transitorios (timeout, error
    de conexión, 429, 5xx); no reintenta el resto de los 4xx (token inválido, tarjeta
    rechazada, parámetros mal formados) -- son resultados de negocio o errores
    permanentes, no algo que un reintento arregle."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _headers(self, *, idempotency_key: str | None = None) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._settings.MERCADOPAGO_ACCESS_TOKEN}"}
        if idempotency_key is not None:
            headers["X-Idempotency-Key"] = idempotency_key
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> MercadoPagoPaymentResult:
        url = f"{self._settings.MERCADOPAGO_API_BASE_URL}{path}"
        timeout = httpx.Timeout(self._settings.MERCADOPAGO_API_TIMEOUT_SECONDS)
        headers = self._headers(idempotency_key=idempotency_key)

        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(1, _MAX_ATTEMPTS + 1):
                is_last_attempt = attempt == _MAX_ATTEMPTS
                try:
                    response = await client.request(method, url, json=json_body, headers=headers)
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    if is_last_attempt:
                        logger.error(
                            "mercadopago_api_call_failed",
                            error_kind=type(exc).__name__,
                            attempt=attempt,
                            path=path,
                        )
                        raise MercadoPagoError(
                            f"No se pudo contactar la API de Mercado Pago: {exc}"
                        ) from exc
                    logger.warning(
                        "mercadopago_api_retry",
                        error_kind=type(exc).__name__,
                        attempt=attempt,
                        path=path,
                    )

                    await asyncio.sleep(_BACKOFF_SECONDS[attempt - 1])
                    continue

                if response.status_code < 300:
                    return _parse_result(response)

                if _is_retryable_status(response.status_code) and not is_last_attempt:
                    logger.warning(
                        "mercadopago_api_retry",
                        status_code=response.status_code,
                        attempt=attempt,
                        path=path,
                    )

                    await asyncio.sleep(_BACKOFF_SECONDS[attempt - 1])
                    continue

                try:
                    error_body = response.json()
                except ValueError:
                    error_body = {}
                logger.error(
                    "mercadopago_api_call_failed",
                    status_code=response.status_code,
                    mp_message=error_body.get("message"),
                    attempt=attempt,
                    path=path,
                )
                raise MercadoPagoError(
                    f"Mercado Pago respondió {response.status_code}: "
                    f"{error_body.get('message', 'error desconocido')}"
                )

        # Inalcanzable: el loop siempre retorna o lanza en el último intento.
        raise MercadoPagoError("No se pudo completar la operación tras agotar los reintentos.")

    async def create_hold(
        self,
        *,
        amount: Decimal,
        currency: str,
        description: str,
        external_reference: str,
        payer_email: str,
        card_payment_data: dict[str, Any],
    ) -> MercadoPagoPaymentResult:
        payload: dict[str, Any] = {
            **card_payment_data,
            "transaction_amount": float(amount),
            "description": description,
            "external_reference": external_reference,
            "capture": False,
            "payer": {**card_payment_data.get("payer", {}), "email": payer_email},
        }
        return await self._request(
            "POST", "/v1/payments", json_body=payload, idempotency_key=str(uuid.uuid4())
        )

    async def capture(
        self, payment_id: str, *, amount: Decimal | None = None
    ) -> MercadoPagoPaymentResult:
        body: dict[str, Any] = {"capture": True}
        if amount is not None:
            body["transaction_amount"] = float(amount)
        return await self._request("PUT", f"/v1/payments/{payment_id}", json_body=body)

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        return await self._request(
            "PUT", f"/v1/payments/{payment_id}", json_body={"status": "cancelled"}
        )

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        return await self._request("GET", f"/v1/payments/{payment_id}")
