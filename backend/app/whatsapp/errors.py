"""Errores de dominio de `app/whatsapp/` -- `WhatsAppSender.send_template` y
`WhatsAppNotificationChannel` los usan para que `NotificationService` (que atrapa
`Exception` en general, ver `app/notify/service.py`) tenga algo específico para
loguear, sin necesitar saber nada de HTTP ni de la Cloud API de Meta.
"""


class WhatsAppSendError(Exception):
    """El envío a la Cloud API de Meta falló (timeout, error HTTP, template
    rechazado, etc.) después de agotar los reintentos correspondientes."""


class WhatsAppPhoneInvalidError(Exception):
    """El comprador o el rematador no tienen un teléfono utilizable para WhatsApp."""
