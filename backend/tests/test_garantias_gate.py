"""Tests del gate de garantía económica en `AuctionEngine.place_bid` -- Fase 4 del plan.
Un remate con `guarantee_required=True` no debe aceptar ofertas de un comprador sin una
`Garantia` `ACTIVE` (ver `app/modules/ofertas/engine.py`); el resto de las reglas del
motor (LIVE/OPEN/incremento mínimo) ya están cubiertas por `test_auction_engine.py`, acá
solo se prueba el gate nuevo.
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.db.session import get_db
from app.main import create_app
from app.modules.garantias.dependencies import get_mercadopago_client
from app.modules.garantias.mercadopago_client import MercadoPagoPaymentResult
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _lotes_url(remate_id) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


def _ofertas_url(remate_id, lote_id) -> str:
    return f"{_lotes_url(remate_id)}/{lote_id}/ofertas"


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
    await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    if role in ("empresa", "rematador"):
        await activate_pending_account(email)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _setup_open_lote_with_guarantee(
    client: AsyncClient, owner_email: str
) -> tuple[str, uuid.UUID, uuid.UUID]:
    """Empresa con un remate LIVE (guarantee_required=True) y un lote OPEN. Devuelve
    (owner_token, remate_id, lote_id)."""
    owner_token = await _register_and_login(client, email=owner_email, role="empresa")
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

    lote_response = await client.post(
        _lotes_url(remate_id),
        json={
            "lot_number": "1",
            "title": "Toro Angus",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "100.00",
        },
        headers=_auth(owner_token),
    )
    assert lote_response.status_code == 201, lote_response.text
    lote_id = uuid.UUID(lote_response.json()["id"])

    schedule = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    start = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(owner_token))
    assert start.status_code == 200, start.text
    open_response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(owner_token)
    )
    assert open_response.status_code == 200, open_response.text
    return owner_token, remate_id, lote_id


async def _bid(client: AsyncClient, token: str, remate_id, lote_id, amount: str):
    return await client.post(
        _ofertas_url(remate_id, lote_id), json={"amount": amount}, headers=_auth(token)
    )


async def test_bid_rejected_without_any_garantia(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote_with_guarantee(
        client, "gar-gate-1@example.com"
    )
    buyer_token = await _register_and_login(
        client, email="gar-gate-1b@example.com", role="comprador"
    )

    response = await _bid(client, buyer_token, remate_id, lote_id, "1000.00")

    assert response.status_code == 403, response.text


async def test_bid_rejected_with_failed_garantia(client: AsyncClient) -> None:
    """`MERCADOPAGO_ENABLED=false` (default de test) -> `NullMercadoPagoClient` siempre
    rechaza -- la garantía queda `FAILED`, que el gate trata igual que "sin garantía"."""
    _owner_token, remate_id, lote_id = await _setup_open_lote_with_guarantee(
        client, "gar-gate-2@example.com"
    )
    buyer_token = await _register_and_login(
        client, email="gar-gate-2b@example.com", role="comprador"
    )

    create = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert create.status_code == 201, create.text
    assert create.json()["status"] == "failed"

    response = await _bid(client, buyer_token, remate_id, lote_id, "1000.00")

    assert response.status_code == 403, response.text


async def test_bid_allowed_with_active_garantia(
    client_with_fake_mp: AsyncClient,
) -> None:
    client = client_with_fake_mp
    _owner_token, remate_id, lote_id = await _setup_open_lote_with_guarantee(
        client, "gar-gate-3@example.com"
    )
    buyer_token = await _register_and_login(
        client, email="gar-gate-3b@example.com", role="comprador"
    )

    create = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert create.status_code == 201, create.text
    assert create.json()["status"] == "active"

    response = await _bid(client, buyer_token, remate_id, lote_id, "1000.00")

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "accepted"


# --- Fixture con Mercado Pago "exitoso" -------------------------------------------------


class _FakeMercadoPagoClient:
    async def create_hold(self, **kwargs) -> MercadoPagoPaymentResult:
        return MercadoPagoPaymentResult(
            payment_id="mp-gate-1", status="authorized", status_detail=None, raw={}
        )

    async def capture(self, payment_id: str, *, amount=None) -> MercadoPagoPaymentResult:
        raise NotImplementedError

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        raise NotImplementedError

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        raise NotImplementedError


@pytest_asyncio.fixture
async def client_with_fake_mp(db_engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_mercadopago_client] = lambda: _FakeMercadoPagoClient()
    app.state.db_session_factory = session_factory

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()
