"""Dependencias de FastAPI de la Garantía Económica -- mismo criterio de selección
Null/real que `app/notify/dependencies.py::_build_whatsapp_sender`.

`build_garantia_service` y `build_mercadopago_client`, sin `Depends()`, son para quien
construye estas piezas sin pasar por la inyección de dependencias de FastAPI --
`AuctionEngine.place_bid` dentro de `app/modules/bots/runner.py` (`build_garantia_service`,
cada reacción de un bot abre su propia sesión, fuera de cualquier request) y
`GarantiaEventDispatcher` (`app/modules/garantias/realtime.py`, `build_mercadopago_client`
-- un único cliente construido una vez en `app/main.py` y pasado por constructor, para que
los tests puedan inyectar un fake sin tocar `Settings`, mismo criterio que
`build_notification_service` con `NotificationService` en `PostAuctionEventDispatcher`)."""

from typing import Annotated

import structlog
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender
from app.modules.garantias.mercadopago_client import (
    MercadoPagoClient,
    NullMercadoPagoClient,
    RealMercadoPagoClient,
)
from app.modules.garantias.notifications import GarantiaEmailNotifier
from app.modules.garantias.repository import GarantiaRepository
from app.modules.garantias.service import GarantiaService
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService
from app.notify.dependencies import _build_email_sender, get_email_sender

logger = structlog.get_logger(__name__)


def build_mercadopago_client(settings: Settings) -> MercadoPagoClient:
    if settings.MERCADOPAGO_ENABLED and settings.MERCADOPAGO_ACCESS_TOKEN:
        return RealMercadoPagoClient(settings)
    logger.warning(
        "mercadopago_client_using_null_fallback",
        mercadopago_enabled=settings.MERCADOPAGO_ENABLED,
        access_token_configured=bool(settings.MERCADOPAGO_ACCESS_TOKEN),
    )
    return NullMercadoPagoClient()


def get_mercadopago_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> MercadoPagoClient:
    return build_mercadopago_client(settings)


def get_garantia_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GarantiaRepository:
    return GarantiaRepository(db)


def get_garantia_email_notifier(
    email_sender: Annotated[EmailSender, Depends(get_email_sender)],
) -> GarantiaEmailNotifier:
    return GarantiaEmailNotifier(email_sender, EmailTemplateRenderer())


def build_garantia_service(
    db: AsyncSession, remate_service: RemateService, settings: Settings
) -> GarantiaService:
    notifier = GarantiaEmailNotifier(_build_email_sender(settings), EmailTemplateRenderer())
    return GarantiaService(
        GarantiaRepository(db), remate_service, build_mercadopago_client(settings), settings, notifier
    )


def get_garantia_service(
    repository: Annotated[GarantiaRepository, Depends(get_garantia_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    mp_client: Annotated[MercadoPagoClient, Depends(get_mercadopago_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    notifier: Annotated[GarantiaEmailNotifier, Depends(get_garantia_email_notifier)],
) -> GarantiaService:
    return GarantiaService(repository, remate_service, mp_client, settings, notifier)
