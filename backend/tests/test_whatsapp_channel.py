"""Tests unitarios de `app/notify/whatsapp_channel.py` -- sin base de datos ni red,
mismo criterio que `test_notify_email.py`: dobles de test escritos a mano, no
`unittest.mock`."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.core.config import Settings
from app.notify.context import LoteAdjudicadoContext
from app.notify.service import NotificationService
from app.notify.whatsapp_channel import WhatsAppNotificationChannel
from app.whatsapp.errors import WhatsAppPhoneInvalidError
from app.whatsapp.redirect_token import resolve_redirect_token


def _settings(**overrides) -> Settings:
    defaults = dict(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
        REDIS_URL="redis://localhost:6379/0",
        SECRET_KEY="test-secret",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def _context(**overrides) -> LoteAdjudicadoContext:
    defaults = dict(
        case_id=uuid.uuid4(),
        lote_id=uuid.uuid4(),
        remate_id=uuid.uuid4(),
        buyer_email="marcos@example.com",
        buyer_name="Marcos",
        buyer_phone="+5491122334455",
        rematador_id=uuid.uuid4(),
        rematador_name="Juan Rematador",
        rematador_phone="+5491133445566",
        remate_title="Gran Subasta de Flota Corporativa y Utilitarios",
        lote_title="Ford Ranger XLT 3.2 4x2 (Año 2018)",
        lot_number="3",
        final_price=Decimal("15000000"),
        currency="ARS",
        adjudicated_at=datetime(2026, 7, 26, 15, 30, tzinfo=UTC),
    )
    defaults.update(overrides)
    return LoteAdjudicadoContext(**defaults)


class _RecordingWhatsAppSender:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def send_template(
        self, *, to: str, body_params: list[str], button_param: str
    ) -> str:
        self.calls.append({"to": to, "body_params": body_params, "button_param": button_param})
        return "wamid.test"


class _FailingWhatsAppSender:
    async def send_template(
        self, *, to: str, body_params: list[str], button_param: str
    ) -> str:
        raise RuntimeError("Meta Cloud API caída")


async def test_whatsapp_channel_sends_with_correct_body_and_button_token() -> None:
    settings = _settings()
    sender = _RecordingWhatsAppSender()
    channel = WhatsAppNotificationChannel(sender, settings)
    context = _context()

    await channel.notify_lote_adjudicado(context)

    assert len(sender.calls) == 1
    call = sender.calls[0]
    assert call["to"] == "5491122334455"
    assert call["body_params"] == [
        "Marcos",
        "3",
        "Gran Subasta de Flota Corporativa y Utilitarios",
        "$15.000.000",
        "Juan Rematador",
    ]
    # El button_param es el token firmado: debe resolver al teléfono del rematador.
    payload = resolve_redirect_token(call["button_param"], settings)
    assert payload["phone"] == "5491133445566"
    assert payload["lot_number"] == "3"
    assert payload["case_id"] == str(context.case_id)


async def test_missing_buyer_phone_raises_before_calling_sender() -> None:
    settings = _settings()
    sender = _RecordingWhatsAppSender()
    channel = WhatsAppNotificationChannel(sender, settings)
    context = _context(buyer_phone=None)

    with pytest.raises(WhatsAppPhoneInvalidError):
        await channel.notify_lote_adjudicado(context)
    assert sender.calls == []


async def test_missing_rematador_phone_raises_before_calling_sender() -> None:
    settings = _settings()
    sender = _RecordingWhatsAppSender()
    channel = WhatsAppNotificationChannel(sender, settings)
    context = _context(rematador_phone=None)

    with pytest.raises(WhatsAppPhoneInvalidError):
        await channel.notify_lote_adjudicado(context)
    assert sender.calls == []


async def test_notification_service_never_raises_when_whatsapp_channel_fails() -> None:
    settings = _settings()
    channel = WhatsAppNotificationChannel(_FailingWhatsAppSender(), settings)
    service = NotificationService([channel])

    results = await service.notify_lote_adjudicado(_context())

    assert len(results) == 1
    assert results[0].success is False
    assert results[0].channel == "whatsapp"
    assert "Meta Cloud API caída" in results[0].error


async def test_notification_service_reports_success_for_whatsapp_channel() -> None:
    settings = _settings()
    channel = WhatsAppNotificationChannel(_RecordingWhatsAppSender(), settings)
    service = NotificationService([channel])

    results = await service.notify_lote_adjudicado(_context())

    assert len(results) == 1
    assert results[0].success is True
    assert results[0].error is None
