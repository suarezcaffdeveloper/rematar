"""Verificación de firma de los webhooks de Mercado Pago (notificaciones asíncronas de
cambio de estado de un pago) -- verificar contra la documentación vigente de Mercado
Pago antes de producción, el algoritmo puede cambiar.

Mercado Pago manda, por cada notificación:
- Header `x-signature`: `ts=<epoch>,v1=<hmac-sha256 hex>`.
- Header `x-request-id`: un id de request propio de MP.
- Query param `data.id`: el id del recurso notificado (para el topic `payment`, el
  `payment_id`).

La firma esperada es `HMAC-SHA256(secret, manifest)` con
`manifest = "id:{data_id};request-id:{x_request_id};ts:{ts};"` -- si `data_id` contiene
letras, van en minúscula (no afecta a los ids puramente numéricos que usa el topic
`payment`, pero se normaliza igual por si acaso).

Falla cerrado: cualquier pieza faltante (header ausente, `data.id` ausente, formato
inesperado) es una firma inválida, nunca "no se pudo verificar, dejar pasar"."""

import hashlib
import hmac


def _parse_signature_header(header_value: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    for chunk in header_value.split(","):
        if "=" not in chunk:
            continue
        key, _, value = chunk.partition("=")
        parts[key.strip()] = value.strip()
    return parts


def verify_mp_webhook_signature(
    *,
    x_signature: str | None,
    x_request_id: str | None,
    data_id: str | None,
    secret: str,
) -> bool:
    if not x_signature or not data_id:
        return False
    parsed = _parse_signature_header(x_signature)
    ts = parsed.get("ts")
    received_v1 = parsed.get("v1")
    if not ts or not received_v1:
        return False

    manifest = f"id:{data_id.lower()};"
    if x_request_id:
        manifest += f"request-id:{x_request_id};"
    manifest += f"ts:{ts};"

    expected = hmac.new(
        secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, received_v1)
