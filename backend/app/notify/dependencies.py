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


def build_notification_service(settings: Settings) -> NotificationService:
    email_channel = EmailNotificationChannel(_build_email_sender(settings), EmailTemplateRenderer())
    return NotificationService([email_channel])


def get_notification_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> NotificationService:
    return build_notification_service(settings)
