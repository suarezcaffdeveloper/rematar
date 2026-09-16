"""Tests de `POST /webhooks/mercadopago` -- Fase 3 del plan. Verifica la verificación de
firma (fail closed: sin secreto configurado, o con firma inválida, siempre 401) y que
una notificación válida dispare `GarantiaService.reconcile` sobre la fila correcta.
"""

import hashlib
import hmac
import time
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app
from app.modules.garantias.dependencies import get_mercadopago_client
from app.modules.garantias.mercadopago_client import MercadoPagoPaymentResult
from tests._role_test_helpers import activate_pending_account

WEBHOOK_URL = "/api/v1/webhooks/mercadopago"
_SECRET = "test-webhook-secret"


def _sign(*, data_id: str, request_id: str, ts: str, secret: str = _SECRET) -> str:
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    digest = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return f"ts={ts},v1={digest}"


class _FakeMercadoPagoClient:
    def __init__(self) -> None:
        self.get_status_result = MercadoPagoPaymentResult(
            payment_id="mp-wh-1", status="authorized", status_detail=None, raw={"id": "mp-wh-1"}
        )

    async def create_hold(self, **kwargs) -> MercadoPagoPaymentResult:
        return MercadoPagoPaymentResult(
            payment_id="mp-wh-1", status="pending", status_detail=None, raw={"id": "mp-wh-1"}
        )

    async def capture(self, payment_id: str, *, amount=None) -> MercadoPagoPaymentResult:
        raise NotImplementedError

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        raise NotImplementedError

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        return self.get_status_result


@pytest_asyncio.fixture
async def webhook_client(
    db_engine: AsyncEngine,
) -> AsyncIterator[tuple[AsyncClient, _FakeMercadoPagoClient]]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    fake_mp_client = _FakeMercadoPagoClient()
    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_mercadopago_client] = lambda: fake_mp_client
    app.dependency_overrides[get_settings] = lambda: get_settings().model_copy(
        update={"MERCADOPAGO_WEBHOOK_SECRET": _SECRET}
    )
    app.state.db_session_factory = session_factory

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac, fake_mp_client

    app.dependency_overrides.clear()


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_webhook_rejects_without_secret_configured(client: AsyncClient) -> None:
    """El `client` compartido de `conftest.py` no tiene `MERCADOPAGO_WEBHOOK_SECRET`
    configurado (default de test) -- fail closed, 401 sin importar el resto."""
    response = await client.post(f"{WEBHOOK_URL}?data.id=123", json={"type": "payment"})
    assert response.status_code == 401, response.text


async def test_webhook_rejects_invalid_signature(
    webhook_client: tuple[AsyncClient, _FakeMercadoPagoClient],
) -> None:
    client, _ = webhook_client
    response = await client.post(
        f"{WEBHOOK_URL}?data.id=123",
        json={"type": "payment", "data": {"id": "123"}},
        headers={"x-signature": "ts=1,v1=deadbeef", "x-request-id": "req-1"},
    )
    assert response.status_code == 401, response.text


async def test_webhook_ignores_unknown_payment(
    webhook_client: tuple[AsyncClient, _FakeMercadoPagoClient],
) -> None:
    client, _ = webhook_client
    ts = str(int(time.time()))
    signature = _sign(data_id="999999", request_id="req-2", ts=ts)
    response = await client.post(
        f"{WEBHOOK_URL}?data.id=999999",
        json={"type": "payment", "data": {"id": "999999"}},
        headers={"x-signature": signature, "x-request-id": "req-2"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ignored"


async def test_webhook_reconciles_matching_garantia(
    webhook_client: tuple[AsyncClient, _FakeMercadoPagoClient],
) -> None:
    client, fake_mp_client = webhook_client

    await client.post(
        REGISTER_URL,
        json={
            "email": "gar-wh-owner@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": "empresa",
        },
    )
    await activate_pending_account("gar-wh-owner@example.com")
    owner_login = await client.post(
        LOGIN_URL, data={"username": "gar-wh-owner@example.com", "password": "password123"}
    )
    owner_token = owner_login.json()["access_token"]

    await client.post(
        REGISTER_URL,
        json={
            "email": "gar-wh-buyer@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    buyer_login = await client.post(
        LOGIN_URL, data={"username": "gar-wh-buyer@example.com", "password": "password123"}
    )
    buyer_token = buyer_login.json()["access_token"]

    remate_response = await client.post(
        REMATES_URL,
        json={
            "title": "Remate con garantía",
            "category": "hacienda",
            "starts_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "settings": {"guarantee_required": True, "guarantee_amount": "50000.00"},
        },
        headers=_auth(owner_token),
    )
    assert remate_response.status_code == 201, remate_response.text
    remate_id = uuid.UUID(remate_response.json()["id"])
    schedule = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text

    create = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert create.status_code == 201, create.text
    assert create.json()["status"] == "pending_authorization"

    fake_mp_client.get_status_result = MercadoPagoPaymentResult(
        payment_id="mp-wh-1", status="authorized", status_detail=None, raw={"id": "mp-wh-1"}
    )
    ts = str(int(time.time()))
    signature = _sign(data_id="mp-wh-1", request_id="req-3", ts=ts)
    webhook = await client.post(
        f"{WEBHOOK_URL}?data.id=mp-wh-1",
        json={"type": "payment", "data": {"id": "mp-wh-1"}},
        headers={"x-signature": signature, "x-request-id": "req-3"},
    )
    assert webhook.status_code == 200, webhook.text
    assert webhook.json()["status"] == "ok"

    me = await client.get(f"{REMATES_URL}/{remate_id}/garantia/me", headers=_auth(buyer_token))
    assert me.json()["status"] == "active"
