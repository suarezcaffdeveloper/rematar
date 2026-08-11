"""Tests unitarios de `app/email/` y `app/notify/` -- sin base de datos: cubren el
armado del HTML, el contrato de `NotificationService` ("mejor esfuerzo, nunca lanza",
mismo criterio que `EventBus`) y que `EmailNotificationChannel` arma el `EmailMessage`
correcto a partir de un `LoteAdjudicadoContext`. La integración con la adjudicación real
(caso creado -> email disparado -> timeline registrado) está en
`test_postauction_service.py` y `test_postauction_realtime.py`.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from app.email.formatting import format_currency, format_date_es
from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.notify.context import LoteAdjudicadoContext
from app.notify.email_channel import EmailNotificationChannel
from app.notify.service import NotificationService


def _context(**overrides) -> LoteAdjudicadoContext:
    defaults = dict(
        case_id=uuid.uuid4(),
        lote_id=uuid.uuid4(),
        remate_id=uuid.uuid4(),
        buyer_email="marcos@example.com",
        buyer_name="Marcos",
        rematador_name="Juan Rematador",
        remate_title="Gran Subasta de Flota Corporativa y Utilitarios",
        lote_title="Ford Ranger XLT 3.2 4x2 (Año 2018)",
        lot_number="3",
        final_price=Decimal("15000000"),
        currency="ARS",
        adjudicated_at=datetime(2026, 7, 26, 15, 30, tzinfo=UTC),
    )
    defaults.update(overrides)
    return LoteAdjudicadoContext(**defaults)


# --- formatting ----------------------------------------------------------------------------


def test_format_currency_ars_uses_dot_as_thousands_separator() -> None:
    assert format_currency(Decimal("15000000"), "ARS") == "$15.000.000"


def test_format_currency_unknown_currency_falls_back_to_code_prefix() -> None:
    assert format_currency(Decimal("100"), "XYZ") == "XYZ 100"


def test_format_date_es_spells_out_month_in_spanish() -> None:
    assert format_date_es(datetime(2026, 7, 26)) == "26 de julio de 2026"


# --- EmailTemplateRenderer -------------------------------------------------------------------


def test_render_lote_adjudicado_includes_real_operation_data() -> None:
    renderer = EmailTemplateRenderer()
    html = renderer.render(
        "lote_adjudicado.html",
        {
            "buyer_name": "Marcos",
            "remate_title": "Gran Subasta de Flota Corporativa y Utilitarios",
            "lote_title": "Ford Ranger XLT 3.2 4x2 (Año 2018)",
            "lot_number": "3",
            "final_price": "$15.000.000",
            "adjudicated_at": "26 de julio de 2026",
            "rematador_name": "Juan Rematador",
            "lote_image_url": None,
            "current_year": 2026,
        },
    )

    assert "Marcos" in html
    assert "Gran Subasta de Flota Corporativa y Utilitarios" in html
    assert "Ford Ranger XLT 3.2 4x2 (Año 2018)" in html
    assert "Lote #3" in html
    assert "$15.000.000" in html
    assert "26 de julio de 2026" in html
    assert "Juan Rematador" in html
    assert "<!DOCTYPE html>" in html


def test_render_lote_adjudicado_escapes_html_in_user_provided_names() -> None:
    renderer = EmailTemplateRenderer()
    html = renderer.render(
        "lote_adjudicado.html",
        {
            "buyer_name": "<script>alert(1)</script>",
            "remate_title": "Remate",
            "lote_title": "Lote",
            "lot_number": "1",
            "final_price": "$100",
            "adjudicated_at": "1 de enero de 2026",
            "rematador_name": "Rematador",
            "lote_image_url": None,
            "current_year": 2026,
        },
    )

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


# --- EmailNotificationChannel ------------------------------------------------------------


class _RecordingEmailSender:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


async def test_email_channel_sends_message_with_real_data_to_buyer() -> None:
    sender = _RecordingEmailSender()
    channel = EmailNotificationChannel(sender, EmailTemplateRenderer())
    context = _context()

    await channel.notify_lote_adjudicado(context)

    assert len(sender.sent) == 1
    message = sender.sent[0]
    assert message.to == "marcos@example.com"
    assert message.to_name == "Marcos"
    assert "Lote #3" in message.subject
    assert "Gran Subasta" in message.subject
    assert "$15.000.000" in message.html_body
    assert "Ford Ranger" in message.html_body


# --- NotificationService --------------------------------------------------------------------


class _FailingSender:
    async def send(self, message: EmailMessage) -> None:
        raise RuntimeError("proveedor SMTP caído")


async def test_notification_service_never_raises_when_a_channel_fails() -> None:
    channel = EmailNotificationChannel(_FailingSender(), EmailTemplateRenderer())
    service = NotificationService([channel])

    results = await service.notify_lote_adjudicado(_context())

    assert len(results) == 1
    assert results[0].success is False
    assert results[0].channel == "email"
    assert "proveedor SMTP caído" in results[0].error


async def test_notification_service_reports_success_per_channel() -> None:
    sender = _RecordingEmailSender()
    channel = EmailNotificationChannel(sender, EmailTemplateRenderer())
    service = NotificationService([channel])

    results = await service.notify_lote_adjudicado(_context())

    assert len(results) == 1
    assert results[0].success is True
    assert results[0].error is None


async def test_notification_service_with_no_channels_does_nothing() -> None:
    service = NotificationService([])

    results = await service.notify_lote_adjudicado(_context())

    assert results == []
