"""Endpoints HTTP de la Garantía Económica -- ver el plan "Garantía económica (bloqueo
de tarjeta) para ofertar en un remate".

`/remates/{remate_id}/garantia*` no vive dentro de `app/modules/remates/` -- se monta
directamente en `app/api/router.py` con el mismo path efectivo, mismo criterio que
`app/snapshot/router.py`/`app/timer/router.py` (paquete transversal propio que cuelga
del prefijo `remates` sin tocar ese módulo).

`POST /webhooks/mercadopago` es top-level (no bajo `/remates/...`): Mercado Pago no sabe
a qué remate pertenece un pago sin que se lo digamos -- se resuelve por
`mp_payment_id`, no por un id de remate en el path. Sin autenticación de usuario (es
Mercado Pago quien llama, no un comprador logueado): la firma HMAC
(`webhook_signature.py`) es la única defensa, verificada ANTES de tocar la base.
"""

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Request

from app.core.config import Settings, get_settings
from app.core.exceptions import UnauthorizedError
from app.modules.auth.dependencies import get_current_user
from app.modules.garantias.dependencies import get_garantia_repository, get_garantia_service
from app.modules.garantias.models import Garantia
from app.modules.garantias.repository import GarantiaRepository
from app.modules.garantias.schemas import GarantiaCreateRequest, GarantiaRead
from app.modules.garantias.service import GarantiaService
from app.modules.garantias.webhook_signature import verify_mp_webhook_signature
from app.modules.users.models import User

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.post(
    "/remates/{remate_id}/garantia",
    response_model=GarantiaRead,
    status_code=201,
    summary="Constituye (o reintenta) la garantía económica para ofertar en este remate",
)
async def create_garantia(
    remate_id: uuid.UUID,
    data: GarantiaCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GarantiaService, Depends(get_garantia_service)],
) -> Garantia:
    # Siempre 201, el resultado (incluido un rechazo de tarjeta -> `status=failed`) va
    # en el cuerpo -- mismo criterio que `POST .../ofertas` (RF-17): un rechazo es un
    # resultado de negocio esperable, no un error HTTP.
    return await service.create_or_retry(
        remate_id=remate_id, buyer=current_user, card_payment_data=data.card_payment_data
    )


@router.get(
    "/remates/{remate_id}/garantia/me",
    response_model=GarantiaRead | None,
    summary="Estado de la garantía propia para este remate -- null si no constituyó ninguna",
)
async def get_my_garantia(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[GarantiaService, Depends(get_garantia_service)],
) -> Garantia | None:
    return await service.get_for_buyer(remate_id, current_user.id)


@router.post(
    "/webhooks/mercadopago",
    summary="Notificación asíncrona de Mercado Pago -- reconcilia el estado de un pago",
)
async def mercadopago_webhook(
    request: Request,
    repository: Annotated[GarantiaRepository, Depends(get_garantia_repository)],
    service: Annotated[GarantiaService, Depends(get_garantia_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    if not settings.MERCADOPAGO_WEBHOOK_SECRET:
        # Fail closed: sin secreto configurado no hay forma de verificar la firma:
        # nunca se procesa un webhook a ciegas solo porque falta la config.
        logger.error("mercadopago_webhook_rejected_no_secret_configured")
        raise UnauthorizedError("Webhook no configurado.")

    data_id = request.query_params.get("data.id")
    if not verify_mp_webhook_signature(
        x_signature=request.headers.get("x-signature"),
        x_request_id=request.headers.get("x-request-id"),
        data_id=data_id,
        secret=settings.MERCADOPAGO_WEBHOOK_SECRET,
    ):
        logger.warning("mercadopago_webhook_rejected_invalid_signature")
        raise UnauthorizedError("Firma de webhook inválida.")

    payload = await request.json()
    if payload.get("type") != "payment":
        return {"status": "ignored"}

    mp_payment_id = str(payload.get("data", {}).get("id") or data_id or "")
    if not mp_payment_id:
        return {"status": "ignored"}

    garantia = await repository.get_by_mp_payment_id(mp_payment_id)
    if garantia is None:
        # No es un pago de garantía de esta plataforma (o el id no matchea) -- 200 igual,
        # Mercado Pago reintenta con backoff cualquier respuesta que no sea 2xx.
        return {"status": "ignored"}

    await service.reconcile(garantia)
    return {"status": "ok"}
