"""Tests HTTP de la Garantía Económica -- Fase 3 del plan. Usa el `client` compartido de
`conftest.py` para los casos que no necesitan tocar el proveedor de Mercado Pago (ahí
`MERCADOPAGO_ENABLED=false` de test hace que se use `NullMercadoPagoClient`, que
siempre rechaza -- exactamente lo que se quiere probar para el camino "no configurado").
Para el camino de éxito (hold `ACTIVE`) se arma una app propia con
`get_mercadopago_client` overrideado a un fake -- mismo patrón que
`test_auth_token_security.py` para casos que necesitan un override que el `client`
compartido no ofrece.
"""

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

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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


async def _create_scheduled_remate(
    client: AsyncClient, owner_token: str, *, guarantee_required: bool, guarantee_amount=None
) -> uuid.UUID:
    """Un remate recién creado queda DRAFT, visible solo para el dueño --
    `RemateService.get_visible_or_raise` (que `GarantiaService.create_or_retry`
    reutiliza) exige al menos SCHEDULED para que un comprador ajeno pueda verlo."""
    settings: dict = {"guarantee_required": guarantee_required}
    if guarantee_amount is not None:
        settings["guarantee_amount"] = guarantee_amount
    payload = {
        "title": "Remate con garantía",
        "category": "hacienda",
        "starts_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        "settings": settings,
    }
    response = await client.post(REMATES_URL, json=payload, headers=_auth(owner_token))
    assert response.status_code == 201, response.text
    remate_id = uuid.UUID(response.json()["id"])

    schedule = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    return remate_id


async def test_create_garantia_requires_buyer_role(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="gar-r1@example.com", role="empresa")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(owner_token),
    )
    assert response.status_code == 403, response.text


async def test_create_garantia_rejected_when_remate_does_not_require_it(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="gar-r2@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r2b@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(client, owner_token, guarantee_required=False)

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 422, response.text


async def test_create_garantia_requires_token_in_payload(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="gar-r3@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r3b@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {}},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 422, response.text


async def test_create_garantia_rejects_raw_card_number(client: AsyncClient) -> None:
    """Defensa en profundidad: el Payment Brick nunca manda un `card_number` crudo, pero
    el endpoint en sí debe rechazarlo explícitamente si algo (o alguien) lo intenta --
    ver el docstring de `_reject_raw_card_data` en `schemas.py`."""
    owner_token = await _register_and_login(client, email="gar-r3c@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r3d@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1", "card_number": "4509953566233704"}},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 422, response.text


async def test_create_garantia_without_mercadopago_configured_returns_failed(
    client: AsyncClient,
) -> None:
    """Con `MERCADOPAGO_ENABLED=false` (default de test), el endpoint no debe romper con
    un 500 -- responde 201 con la garantía en `status=failed` (ver
    `NullMercadoPagoClient`)."""
    owner_token = await _register_and_login(client, email="gar-r4@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r4b@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "failed"

    me = await client.get(f"{REMATES_URL}/{remate_id}/garantia/me", headers=_auth(buyer_token))
    assert me.status_code == 200, me.text
    assert me.json()["status"] == "failed"


async def test_get_my_garantia_returns_null_when_none_exists(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="gar-r5@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r5b@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.get(
        f"{REMATES_URL}/{remate_id}/garantia/me", headers=_auth(buyer_token)
    )
    assert response.status_code == 200, response.text
    assert response.json() is None


# --- Camino de éxito: requiere overridear el cliente de Mercado Pago -------------------


class _FakeMercadoPagoClient:
    async def create_hold(self, **kwargs) -> MercadoPagoPaymentResult:
        return MercadoPagoPaymentResult(
            payment_id="mp-fake-1", status="authorized", status_detail=None, raw={"id": "mp-fake-1"}
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


async def test_create_garantia_success_sets_active(client_with_fake_mp: AsyncClient) -> None:
    client = client_with_fake_mp
    owner_token = await _register_and_login(client, email="gar-r6@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="gar-r6b@example.com", role="comprador")
    remate_id = await _create_scheduled_remate(
        client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
    )

    response = await client.post(
        f"{REMATES_URL}/{remate_id}/garantia",
        json={"card_payment_data": {"token": "tok-1"}},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "active"
    assert body["amount"] == "50000.00" or float(body["amount"]) == 50000.00
    assert body["expires_at"] is not None
    # Nunca expone identificadores/estado crudo de Mercado Pago.
    assert "mp_payment_id" not in body
    assert "mp_status" not in body


async def test_create_garantia_is_rate_limited_per_buyer(db_engine: AsyncEngine) -> None:
    """Defensa contra "card testing" (probar muchas tarjetas robadas contra este
    endpoint): un mismo comprador no puede intentar constituir/reintentar una garantía
    de forma ilimitada -- ver `GARANTIA_RATE_LIMIT_*` en `core/config.py`."""
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    limited_settings = get_settings().model_copy(
        update={"GARANTIA_RATE_LIMIT_MAX_ATTEMPTS": 1, "GARANTIA_RATE_LIMIT_WINDOW_SECONDS": 60}
    )

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_mercadopago_client] = lambda: _FakeMercadoPagoClient()
    app.dependency_overrides[get_settings] = lambda: limited_settings
    app.state.db_session_factory = session_factory

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            owner_token = await _register_and_login(
                client, email="gar-rl1@example.com", role="empresa"
            )
            buyer_token = await _register_and_login(
                client, email="gar-rl1b@example.com", role="comprador"
            )
            remate_id = await _create_scheduled_remate(
                client, owner_token, guarantee_required=True, guarantee_amount="50000.00"
            )

            first = await client.post(
                f"{REMATES_URL}/{remate_id}/garantia",
                json={"card_payment_data": {"token": "tok-1"}},
                headers=_auth(buyer_token),
            )
            assert first.status_code == 201, first.text

            second = await client.post(
                f"{REMATES_URL}/{remate_id}/garantia",
                json={"card_payment_data": {"token": "tok-1"}},
                headers=_auth(buyer_token),
            )
            assert second.status_code == 429, second.text

    app.dependency_overrides.clear()
