"""Tests HTTP del PostAuction Service (Épica 7, Módulo 7.5) -- mismo estilo que
`test_remates.py`: registrar/loguear vía API, construir el caso post-remate directo en
`db_session` (el enganche real con `lote.winner_determined` lo cubre
`test_postauction_realtime.py`, no este archivo)."""

import uuid
from decimal import Decimal
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
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


async def _setup_case(
    client: AsyncClient, db_session: AsyncSession
) -> tuple[str, str, PostAuctionCase]:
    """Registra rematador y comprador, crea remate + lote propios vía API, e inserta el
    caso post-remate directo en la base (el disparo automático vía evento se prueba en
    `test_postauction_realtime.py`)."""
    rematador_token = await _register_and_login(
        client, email=f"remat{uuid.uuid4()}@example.com", role="empresa"
    )
    buyer_token = await _register_and_login(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )
    rematador_id = await _current_user_id(client, rematador_token)
    buyer_id = await _current_user_id(client, buyer_token)

    remate_response = await client.post(
        REMATES_URL,
        json={"title": "Remate de campo", "category": "hacienda"},
        headers=_auth(rematador_token),
    )
    assert remate_response.status_code == 201, remate_response.text
    remate_id = uuid.UUID(remate_response.json()["id"])

    lote_response = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes",
        json={
            "lot_number": "1",
            "title": "Toro Angus",
            "category": "hacienda",
            "base_price": "1000",
            "min_increment": "100",
        },
        headers=_auth(rematador_token),
    )
    assert lote_response.status_code == 201, lote_response.text
    lote_id = uuid.UUID(lote_response.json()["id"])

    case = PostAuctionCase(
        lote_id=lote_id,
        remate_id=remate_id,
        buyer_id=buyer_id,
        rematador_id=rematador_id,
        final_price=Decimal("1500"),
        status=PostAuctionStatus.ADJUDICADO,
    )
    db_session.add(case)
    await db_session.commit()
    await db_session.refresh(case)

    return rematador_token, buyer_token, case


# --- Ventas adjudicadas (rematador) ---------------------------------------------------


async def test_rematador_sees_own_venta_in_list(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.get(f"{POSTAUCTION_URL}/ventas", headers=_auth(rematador_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(case.id)
    assert body["items"][0]["lote_title"] == "Toro Angus"


async def test_other_rematador_cannot_see_venta_detail(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, case = await _setup_case(client, db_session)
    other_token = await _register_and_login(
        client, email=f"other{uuid.uuid4()}@example.com", role="empresa"
    )

    response = await client.get(
        f"{POSTAUCTION_URL}/ventas/{case.id}", headers=_auth(other_token)
    )
    assert response.status_code == 403


async def test_comprador_cannot_list_ventas(client: AsyncClient, db_session: AsyncSession) -> None:
    _, buyer_token, _ = await _setup_case(client, db_session)

    response = await client.get(f"{POSTAUCTION_URL}/ventas", headers=_auth(buyer_token))
    assert response.status_code == 403


async def test_change_estado_updates_status_and_returns_timeline(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.patch(
        f"{POSTAUCTION_URL}/ventas/{case.id}/estado",
        json={"new_status": "pendiente_contacto", "note": "Lo contacté por WhatsApp"},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "pendiente_contacto"
    assert len(body["timeline"]) == 1
    assert body["timeline"][0]["action"] == "status_changed"
    assert body["timeline"][0]["note"] == "Lo contacté por WhatsApp"


async def test_change_estado_rejects_invalid_transition(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)
    await client.patch(
        f"{POSTAUCTION_URL}/ventas/{case.id}/estado",
        json={"new_status": "entregado"},
        headers=_auth(rematador_token),
    )

    response = await client.patch(
        f"{POSTAUCTION_URL}/ventas/{case.id}/estado",
        json={"new_status": "pago_pendiente"},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 422


async def test_add_nota_does_not_change_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.post(
        f"{POSTAUCTION_URL}/ventas/{case.id}/notas",
        json={"note": "Pidió factura A"},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "adjudicado"
    assert body["notes"] == "Pidió factura A"


# --- Documentos (rematador) -------------------------------------------------------------


def _documentos_url(case_id: uuid.UUID) -> str:
    return f"{POSTAUCTION_URL}/ventas/{case_id}/documentos"


async def test_owner_can_upload_document(client: AsyncClient, db_session: AsyncSession) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.post(
        _documentos_url(case.id),
        data={"document_type": "factura"},
        files={"file": ("factura.pdf", b"contenido-de-prueba", "application/pdf")},
        headers=_auth(rematador_token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["documents"]) == 1
    document = body["documents"][0]
    assert document["document_type"] == "factura"
    assert document["original_filename"] == "factura.pdf"
    assert document["content_type"] == "application/pdf"
    assert f"/static/postauction/{case.id}/" in document["url"]
    assert body["timeline"][-1]["action"] == "document_uploaded"

    relative_path = document["url"].split("/static/", 1)[1]
    saved_file = Path(get_settings().MEDIA_ROOT) / relative_path
    assert saved_file.read_bytes() == b"contenido-de-prueba"


async def test_upload_document_defaults_to_otro_type(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.post(
        _documentos_url(case.id),
        files={"file": ("comprobante.jpg", b"contenido", "image/jpeg")},
        headers=_auth(rematador_token),
    )

    assert response.status_code == 200, response.text
    assert response.json()["documents"][0]["document_type"] == "otro"


async def test_upload_document_rejects_unsupported_content_type(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.post(
        _documentos_url(case.id),
        files={"file": ("archivo.txt", b"no es un documento admitido", "text/plain")},
        headers=_auth(rematador_token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_upload_document_rejects_oversized_file(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    oversized = b"0" * (10 * 1024 * 1024 + 1)
    response = await client.post(
        _documentos_url(case.id),
        files={"file": ("grande.pdf", oversized, "application/pdf")},
        headers=_auth(rematador_token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_non_owner_cannot_upload_document(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, case = await _setup_case(client, db_session)
    other_token = await _register_and_login(
        client, email=f"other{uuid.uuid4()}@example.com", role="empresa"
    )

    response = await client.post(
        _documentos_url(case.id),
        files={"file": ("factura.pdf", b"contenido", "application/pdf")},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


async def test_buyer_cannot_upload_document(client: AsyncClient, db_session: AsyncSession) -> None:
    _, buyer_token, case = await _setup_case(client, db_session)

    response = await client.post(
        _documentos_url(case.id),
        files={"file": ("factura.pdf", b"contenido", "application/pdf")},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 403


async def test_owner_can_delete_document(client: AsyncClient, db_session: AsyncSession) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)
    upload = await client.post(
        _documentos_url(case.id),
        files={"file": ("factura.pdf", b"contenido", "application/pdf")},
        headers=_auth(rematador_token),
    )
    document_id = upload.json()["documents"][0]["id"]

    response = await client.delete(
        f"{_documentos_url(case.id)}/{document_id}", headers=_auth(rematador_token)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["documents"] == []
    assert body["timeline"][-1]["action"] == "document_deleted"


async def test_delete_unknown_document_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, _, case = await _setup_case(client, db_session)

    response = await client.delete(
        f"{_documentos_url(case.id)}/{uuid.uuid4()}", headers=_auth(rematador_token)
    )
    assert response.status_code == 404


# --- Mis compras (comprador) -----------------------------------------------------------


async def test_buyer_sees_own_compra(client: AsyncClient, db_session: AsyncSession) -> None:
    _, buyer_token, case = await _setup_case(client, db_session)

    response = await client.get(f"{POSTAUCTION_URL}/mis-compras", headers=_auth(buyer_token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(case.id)


async def test_buyer_sees_documents_uploaded_by_rematador(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, buyer_token, case = await _setup_case(client, db_session)
    await client.post(
        _documentos_url(case.id),
        data={"document_type": "factura"},
        files={"file": ("factura.pdf", b"contenido", "application/pdf")},
        headers=_auth(rematador_token),
    )

    response = await client.get(
        f"{POSTAUCTION_URL}/mis-compras/{case.id}", headers=_auth(buyer_token)
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["documents"]) == 1


async def test_other_buyer_cannot_see_compra_detail(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, case = await _setup_case(client, db_session)
    other_buyer_token = await _register_and_login(
        client, email=f"other{uuid.uuid4()}@example.com", role="comprador"
    )

    response = await client.get(
        f"{POSTAUCTION_URL}/mis-compras/{case.id}", headers=_auth(other_buyer_token)
    )
    assert response.status_code == 404
