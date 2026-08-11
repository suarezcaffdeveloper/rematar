"""Contrato de envío de email. Ver docs del proyecto sobre `EventBus`
(`app/events/bus.py`) para el mismo criterio: un `Protocol` (PEP 544, tipado
estructural) del que depende el resto del sistema, nunca de una implementación
concreta -- así se puede pasar de SMTP a la API de un proveedor transaccional sin
tocar `app/notify/`.

A diferencia de `EventBus.publish` (que nunca lanza), `EmailSender.send` SÍ puede
lanzar: quien orquesta el envío (`app/notify/service.py::NotificationService`) es
responsable de atrapar el error, no el sender -- así el resultado (éxito/fallo) queda
disponible para quien quiera registrar trazabilidad (ver
`PostAuctionService.create_case_from_winner`).
"""

from typing import Protocol

from app.email.message import EmailMessage


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...
