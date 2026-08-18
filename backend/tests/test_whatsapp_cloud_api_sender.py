"""Tests de `app/whatsapp/cloud_api_sender.py` contra `httpx.MockTransport` (una
funcionalidad nativa de `httpx` para testear sin red real, no una librería de mocking
-- mismo criterio de "dobles de test escritos a mano" del resto de la suite).
"""

import httpx
import pytest

import app.whatsapp.cloud_api_sender as cloud_api_sender_module
from app.core.config import Settings
from app.whatsapp.cloud_api_sender import CloudApiWhatsAppSender
from app.whatsapp.errors import WhatsAppSendError


def _settings(**overrides) -> Settings:
    defaults = dict(
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/db",
        REDIS_URL="redis://localhost:6379/0",
        SECRET_KEY="test-secret",
        WHATSAPP_ACCESS_TOKEN="test-token",
        WHATSAPP_PHONE_NUMBER_ID="123456",
    )
    defaults.update(overrides)
    return Settings(**defaults)


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    async def _instant_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(cloud_api_sender_module.asyncio, "sleep", _instant_sleep)


def _patch_transport(monkeypatch, handler) -> list[httpx.Request]:
    calls: list[httpx.Request] = []

    def _handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request, len(calls))

    original_init = httpx.AsyncClient.__init__

    def _patched_init(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(_handler)
        return original_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _patched_init)
    return calls


async def test_success_returns_message_id_without_retry(monkeypatch) -> None:
    calls = _patch_transport(
        monkeypatch,
        lambda request, n: httpx.Response(200, json={"messages": [{"id": "wamid.abc"}]}),
    )
    sender = CloudApiWhatsAppSender(_settings())

    message_id = await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")

    assert message_id == "wamid.abc"
    assert len(calls) == 1


async def test_timeout_on_every_attempt_raises_after_three_attempts(monkeypatch) -> None:
    def _handler(request: httpx.Request, n: int) -> httpx.Response:
        raise httpx.TimeoutException("timed out", request=request)

    calls = _patch_transport(monkeypatch, _handler)
    sender = CloudApiWhatsAppSender(_settings())

    with pytest.raises(WhatsAppSendError):
        await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")
    assert len(calls) == 3


async def test_401_raises_immediately_without_retry(monkeypatch) -> None:
    calls = _patch_transport(
        monkeypatch,
        lambda request, n: httpx.Response(
            401, json={"error": {"code": 190, "message": "Invalid OAuth access token"}}
        ),
    )
    sender = CloudApiWhatsAppSender(_settings())

    with pytest.raises(WhatsAppSendError, match="Invalid OAuth access token"):
        await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")
    assert len(calls) == 1


async def test_429_then_200_succeeds_on_second_attempt(monkeypatch) -> None:
    def _handler(request: httpx.Request, n: int) -> httpx.Response:
        if n == 1:
            return httpx.Response(429, json={"error": {"code": 80007, "message": "Rate limited"}})
        return httpx.Response(200, json={"messages": [{"id": "wamid.retry-ok"}]})

    calls = _patch_transport(monkeypatch, _handler)
    sender = CloudApiWhatsAppSender(_settings())

    message_id = await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")

    assert message_id == "wamid.retry-ok"
    assert len(calls) == 2


async def test_500_on_all_attempts_raises_after_three_attempts(monkeypatch) -> None:
    calls = _patch_transport(
        monkeypatch,
        lambda request, n: httpx.Response(
            500, json={"error": {"code": 1, "message": "Internal error"}}
        ),
    )
    sender = CloudApiWhatsAppSender(_settings())

    with pytest.raises(WhatsAppSendError):
        await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")
    assert len(calls) == 3


async def test_template_rejected_400_raises_immediately_without_retry(monkeypatch) -> None:
    calls = _patch_transport(
        monkeypatch,
        lambda request, n: httpx.Response(
            400,
            json={
                "error": {
                    "code": 132001,
                    "message": "Template name does not exist in the translation",
                }
            },
        ),
    )
    sender = CloudApiWhatsAppSender(_settings())

    with pytest.raises(WhatsAppSendError, match="does not exist"):
        await sender.send_template(to="5491122334455", body_params=["a"], button_param="t")
    assert len(calls) == 1
