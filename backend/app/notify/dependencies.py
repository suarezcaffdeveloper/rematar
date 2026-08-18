"""Dependencia de FastAPI de `NotificationService`, y su fábrica sin `Depends()`
(`build_notification_service`) para el consumidor de fondo que también lo necesita
(`PostAuctionEventDispatcher`, ver `app/main.py`) -- mismo criterio que
`RedisEventBus`/`get_event_bus` (`app/events/dependencies.py`): un consumidor de fondo
no pasa por la inyección de dependencias de FastAPI."""

from typing import Annotated

import structlog
from fastapi import Depends

from app.core.config import Settings, get_settings
from app.email.null_sender import NullEmailSender
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender
from app.email.smtp_sender import SmtpEmailSender
from app.notify.email_channel import EmailNotificationChannel
from app.notify.service import NotificationService
from app.notify.whatsapp_channel import WhatsAppNotificationChannel
from app.whatsapp.cloud_api_sender import CloudApiWhatsAppSender
from app.whatsapp.null_sender import NullWhatsAppSender
from app.whatsapp.sender import WhatsAppSender

logger = structlog.get_logger(__name__)


def _build_email_sender(settings: Settings) -> EmailSender:
    if settings.EMAIL_ENABLED and settings.SMTP_HOST:
        return SmtpEmailSender(settings)
    logger.warning(
        "email_sender_using_null_fallback",
        email_enabled=settings.EMAIL_ENABLED,
        smtp_host_configured=bool(settings.SMTP_HOST),
    )
    return NullEmailSender()


def _build_whatsapp_sender(settings: Settings) -> WhatsAppSender:
    if settings.WHATSAPP_ENABLED and settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID:
        return CloudApiWhatsAppSender(settings)
    logger.warning(
        "whatsapp_sender_using_null_fallback",
        whatsapp_enabled=settings.WHATSAPP_ENABLED,
        whatsapp_configured=bool(
            settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID
        ),
    )
    return NullWhatsAppSender()


def build_notification_service(settings: Settings) -> NotificationService:
    email_channel = EmailNotificationChannel(_build_email_sender(settings), EmailTemplateRenderer())
    whatsapp_channel = WhatsAppNotificationChannel(_build_whatsapp_sender(settings), settings)
    return NotificationService([email_channel, whatsapp_channel])


def get_notification_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> NotificationService:
    return build_notification_service(settings)


def get_email_sender(settings: Annotated[Settings, Depends(get_settings)]) -> EmailSender:
    """Expone `_build_email_sender` como dependencia de FastAPI para quien necesite
    mandar un email fuera del flujo de adjudicación (`NotificationService`) -- hoy,
    `app.modules.auth.notifications.AuthEmailNotifier` (recuperación de contraseña).
    Mismo criterio de fallback a `NullEmailSender` sin `SMTP_HOST`/`EMAIL_ENABLED`."""
    return _build_email_sender(settings)
