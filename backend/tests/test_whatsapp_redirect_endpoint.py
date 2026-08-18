"""Tests de integración de `GET /r/wa/{token}` -- cliente ASGI real (misma fixture
`client` que el resto de la suite, ver `tests/conftest.py`)."""

import uuid
from datetime import timedelta

from httpx import AsyncClient

from app.core.config import get_settings
from app.core.security import encode_token
from app.whatsapp.redirect_token import build_redirect_token


async def test_valid_token_redirects_to_wa_me_with_prefilled_text(client: AsyncClient) -> None:
    settings = get_settings()
    token = build_redirect_token(
        case_id=uuid.uuid4(),
        rematador_phone="5491133445566",
        lot_number="7",
        settings=settings,
    )

    response = await client.get(f"/r/wa/{token}", follow_redirects=False)

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://wa.me/5491133445566?text=")
    assert "lote%207" in location


async def test_malformed_token_returns_friendly_404(client: AsyncClient) -> None:
    response = await client.get("/r/wa/esto-no-es-un-token", follow_redirects=False)

    assert response.status_code == 404
    assert "text/html" in response.headers["content-type"]
    assert "no es válido" in response.text


async def test_expired_token_returns_friendly_404(client: AsyncClient) -> None:
    settings = get_settings()
    token = encode_token(
        {
            "type": "whatsapp_redirect",
            "case_id": str(uuid.uuid4()),
            "phone": "5491133445566",
            "lot_number": "7",
        },
        secret_key=settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        expires_delta=timedelta(seconds=-1),
    )

    response = await client.get(f"/r/wa/{token}", follow_redirects=False)

    assert response.status_code == 404
    assert "no es válido" in response.text
