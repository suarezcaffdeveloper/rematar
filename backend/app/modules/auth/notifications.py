"""Envío de los emails del flujo de recuperación de contraseña.

Deliberadamente separado de `NotificationService`/`NotificationChannel` (`app/notify/`):
esos existen para orquestar el mejor-esfuerzo *multi-canal* (email + WhatsApp) de la
notificación de adjudicación de un lote, con resultado por canal para dejar trazabilidad
en el timeline post-remate. Acá no hay nada de eso -- no tiene sentido un WhatsApp de
"reseteá tu contraseña", y no hay un timeline de negocio donde registrar el resultado --
así que alcanza con componer `EmailSender`/`EmailTemplateRenderer` directamente, como ya
anticipaba el docstring de `EmailNotificationChannel`: "Un email nuevo (bienvenida,
recuperación de contraseña) en el futuro es un método más acá, no un canal nuevo" (acá
"acá" es esta responsabilidad, en una clase propia porque el llamador -- `AuthService`,
que no sabe nada de adjudicaciones -- es distinto).

Mismo criterio best-effort que `NotificationService`: nunca lanza, solo loguea si falla.
El envío de este email nunca puede tumbar un flujo de auth que ya se confirmó en la base.
"""

from datetime import UTC, datetime

import structlog

from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.email.sender import EmailSender

logger = structlog.get_logger(__name__)


class AuthEmailNotifier:
    def __init__(self, sender: EmailSender, renderer: EmailTemplateRenderer) -> None:
        self._sender = sender
        self._renderer = renderer

    async def send_password_reset(
        self, *, to: str, to_name: str, reset_url: str, expires_minutes: int
    ) -> None:
        html = self._renderer.render(
            "password_reset.html",
            {
                "user_name": to_name,
                "reset_url": reset_url,
                "expires_minutes": expires_minutes,
                "current_year": datetime.now(UTC).year,
            },
        )
        try:
            await self._sender.send(
                EmailMessage(
                    to=to,
                    to_name=to_name,
                    subject="Recuperá tu contraseña - RematAR",
                    html_body=html,
                )
            )
        except Exception:
            logger.exception("password_reset_email_failed", to=to)

    async def send_password_changed(self, *, to: str, to_name: str) -> None:
        html = self._renderer.render(
            "password_changed.html",
            {"user_name": to_name, "current_year": datetime.now(UTC).year},
        )
        try:
            await self._sender.send(
                EmailMessage(
                    to=to,
                    to_name=to_name,
                    subject="Tu contraseña fue actualizada - RematAR",
                    html_body=html,
                )
            )
        except Exception:
            logger.exception("password_changed_email_failed", to=to)
