"""Tests de Fase 8 (WebSocket Security Audit -- API Authorization / BOLA / IDOR).

El resto de la suite (`test_remates.py`, `test_lotes.py`, `test_bots_api.py`,
`test_postauction_router.py`, `test_moderation_router.py`, `test_history_router.py`,
`test_audit_router.py`, `test_analytics_router.py`, ...) ya cubre extensivamente
read/update/delete IDOR sobre el CRUD estructural de cada recurso (dueño ALLOW, ajeno
DENY). Este archivo llena específicamente los huecos que la Fase 8 pide auditar y que
esos archivos no ejercitan todavía:

- ACTION IDOR: endpoints de transición de estado (`/start`, `/cancel`, `/open`, `/close`)
  y de acciones de negocio (`/postauction/.../estado`, simulación de bots) -- no son CRUD,
  y cada uno podría, en teoría, haberse olvidado de llamar al mismo chequeo de ownership
  que ya protege el CRUD.
- OWNERSHIP CHAIN: un `lote_id` real pero combinado con un `remate_id` de otro remate en
  el path -- prueba que la autorización valida la cadena completa (`lote.remate_id ==
  remate_id` del path), no solo que el lote exista.
- USER ID SPOOFING: confirma que un campo `buyer_id` colado en el body de una oferta se
  ignora -- el comprador que puja siempre es quien viene del JWT (`current_user`), nunca
  un valor que el cliente pueda mandar.

Todas las rutas ya delegan ownership al service layer vía `RemateService.get_owned_or_raise`
(ver `app/modules/remates/service.py`) -- lo que se prueba acá es que efectivamente lo
hacen, no que exista una vulnerabilidad ya conocida.
"""

import uuid
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.postauction.models import PostAuctionCase, PostAuctionStatus
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
POSTAUCTION_URL = "/api/v1/postauction"


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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _current_user_id(client: AsyncClient, token: str) -> uuid.UUID:
    response = await client.get("/api/v1/users/me", headers=_auth(token))
    assert response.status_code == 200, response.text
    return uuid.UUID(response.json()["id"])


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de campo",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    response = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _create_lote(client: AsyncClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": overrides.pop("lot_number", "1"),
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
    }
    payload.update(overrides)
    response = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes", json=payload, headers=_auth(token)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _schedule_and_start(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text


# --- ACTION IDOR: transiciones de estado de Remate --------------------------------------


async def test_other_rematador_cannot_start_foreign_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/start", headers=_auth(attacker_token)
    )
    assert response.status_code == 403


async def test_other_rematador_cannot_cancel_foreign_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    await _schedule_and_start_after_lote(client, owner_token, remate["id"])

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel",
        json={"reason": "intento hostil"},
        headers=_auth(attacker_token),
    )
    assert response.status_code == 403


async def _schedule_and_start_after_lote(client: AsyncClient, token: str, remate_id: str) -> None:
    await _create_lote(client, token, remate_id)
    await _schedule_and_start(client, token, remate_id)


# --- ACTION IDOR: transiciones de estado de Lote -----------------------------------------


async def test_other_rematador_cannot_open_foreign_lote(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_start(client, owner_token, remate["id"])

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(attacker_token)
    )
    assert response.status_code == 403


async def test_other_rematador_cannot_cancel_foreign_lote(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_start(client, owner_token, remate["id"])
    await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(owner_token)
    )

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/cancel",
        json={"reason": "intento hostil"},
        headers=_auth(attacker_token),
    )
    assert response.status_code == 403


# --- OWNERSHIP CHAIN: lote_id real, pero bajo el remate_id equivocado -------------------


async def test_lote_of_another_remate_is_not_reachable_by_swapping_remate_id(
    client: AsyncClient,
) -> None:
    """Un `lote_id` que existe, pero pertenece a `remate_a`, pedido bajo el path de
    `remate_b` (mismo dueño en ambos, para aislar la variable a la CADENA de ownership --
    no a un simple chequeo `owner_id == current_user.id`). Debe dar 404: la autorización
    tiene que validar `lote.remate_id == remate_id` del path, no solo resolver el lote por
    su propio id."""
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    remate_a = await _create_remate(client, owner_token, title="Remate A")
    remate_b = await _create_remate(client, owner_token, title="Remate B")
    lote_a = await _create_lote(client, owner_token, remate_a["id"])

    response = await client.get(
        f"{REMATES_URL}/{remate_b['id']}/lotes/{lote_a['id']}", headers=_auth(owner_token)
    )
    assert response.status_code == 404

    update_response = await client.patch(
        f"{REMATES_URL}/{remate_b['id']}/lotes/{lote_a['id']}",
        json={"title": "Secuestrado"},
        headers=_auth(owner_token),
    )
    assert update_response.status_code == 404


# --- ACTION IDOR: PostAuction -------------------------------------------------------------


async def test_other_rematador_cannot_change_estado_of_foreign_case(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    buyer_token = await _register_and_login(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )
    owner_id = await _current_user_id(client, owner_token)
    buyer_id = await _current_user_id(client, buyer_token)

    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])

    case = PostAuctionCase(
        lote_id=uuid.UUID(lote["id"]),
        remate_id=uuid.UUID(remate["id"]),
        buyer_id=buyer_id,
        rematador_id=owner_id,
        final_price=Decimal("1500"),
        status=PostAuctionStatus.ADJUDICADO,
    )
    db_session.add(case)
    await db_session.commit()
    await db_session.refresh(case)

    response = await client.patch(
        f"{POSTAUCTION_URL}/ventas/{case.id}/estado",
        json={"new_status": "pendiente_contacto"},
        headers=_auth(attacker_token),
    )
    assert response.status_code == 403


# --- USER ID SPOOFING: buyer_id en el body de una oferta se ignora ---------------------


async def test_bid_buyer_id_in_body_is_ignored_bid_is_always_current_user(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    buyer_token = await _register_and_login(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )
    other_buyer_id = uuid.uuid4()
    buyer_id = await _current_user_id(client, buyer_token)

    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_start(client, owner_token, remate["id"])
    await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(owner_token)
    )

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/ofertas",
        # `buyer_id` no es un campo del schema `OfertaCreate` -- Pydantic lo descarta
        # silenciosamente (extra="ignore" por default), así que esto no debería, ni
        # siquiera accidentalmente, hacer que la oferta quede a nombre de otro usuario.
        json={"amount": "1000.00", "buyer_id": str(other_buyer_id)},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 201, response.text
    assert response.json()["buyer_id"] == str(buyer_id)
    assert response.json()["buyer_id"] != str(other_buyer_id)


# --- ACTION IDOR: simulación de bots -----------------------------------------------------


async def test_other_rematador_cannot_start_bot_simulation_of_foreign_remate(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    # Programado (no DRAFT): así el 404 esperable de un borrador ajeno
    # (`RemateService._is_visible`) no se confunde con la denegación de ownership que
    # este test quiere probar -- acá interesa específicamente el 403 de
    # `get_owned_or_raise` sobre un remate ya visible.
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/start", headers=_auth(attacker_token)
    )
    assert response.status_code == 403


async def test_other_rematador_cannot_set_bot_selection_of_foreign_remate(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    attacker_token = await _register_and_login(
        client, email=f"attacker{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    response = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": []},
        headers=_auth(attacker_token),
    )
    assert response.status_code == 403


# --- UNAUTHENTICATED: cualquier acción sobre estos recursos exige un token válido ------


async def test_unauthenticated_cannot_start_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email=f"owner{uuid.uuid4()}@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    response = await client.post(f"{REMATES_URL}/{remate['id']}/start")
    assert response.status_code == 401
