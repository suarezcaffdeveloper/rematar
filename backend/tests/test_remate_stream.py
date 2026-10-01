"""Transmisión en vivo embebida de un remate: parser de URL (seguridad) y endpoints
`PUT/DELETE /remates/{id}/stream` (permisos, estados, auditoría)."""

import pytest
from httpx import AsyncClient

from app.modules.remates.stream import InvalidStreamUrlError, extract_youtube_video_id
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"

VIDEO_ID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtube.com/watch?v={VIDEO_ID}&t=10s",
        f"https://m.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}?si=abc",
        f"https://www.youtube.com/live/{VIDEO_ID}",
        f"https://www.youtube.com/live/{VIDEO_ID}?feature=share",
        f"https://www.youtube.com/embed/{VIDEO_ID}",
        f"https://www.youtube-nocookie.com/embed/{VIDEO_ID}",
        f"  https://www.youtube.com/watch?v={VIDEO_ID}  ",
    ],
)
def test_extract_valid_variants(url: str) -> None:
    assert extract_youtube_video_id(url) == VIDEO_ID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "javascript:alert(1)",
        f"http://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtube.com.evil.io/watch?v={VIDEO_ID}",
        f"https://evil.io/youtube.com/watch?v={VIDEO_ID}",
        f"https://www.youtube.com@evil.io/watch?v={VIDEO_ID}",
        f"https://user:pw@www.youtube.com/watch?v={VIDEO_ID}",
        f"https://vimeo.com/{VIDEO_ID}",
        "https://www.youtube.com/watch?v=corto",
        f"https://www.youtube.com/watch?v={VIDEO_ID}extra",
        "https://www.youtube.com/watch?v=<script>al</script>",
        "https://www.youtube.com/watch",
        "https://www.youtube.com/",
        "https://youtu.be/",
        "https://www.youtube.com/@canal/live",
        "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/live",
        "https://" + "a" * 3000,
        VIDEO_ID,
    ],
)
def test_extract_rejects_invalid(url: str) -> None:
    with pytest.raises(InvalidStreamUrlError):
        extract_youtube_video_id(url)


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


async def _create_remate(client: AsyncClient, token: str) -> dict:
    response = await client.post(
        REMATES_URL, json={"title": "Remate stream", "category": "hacienda"}, headers=_auth(token)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _stream_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/stream"


async def test_owner_sets_and_clears_stream(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="st-owner1@example.com", role="empresa")
    remate = await _create_remate(client, token)
    assert remate["stream_video_id"] is None

    put = await client.put(
        _stream_url(remate["id"]),
        json={"url": f"https://youtu.be/{VIDEO_ID}"},
        headers=_auth(token),
    )
    assert put.status_code == 200, put.text
    assert put.json()["stream_video_id"] == VIDEO_ID
    assert put.json()["stream_provider"] == "youtube"

    delete = await client.delete(_stream_url(remate["id"]), headers=_auth(token))
    assert delete.status_code == 200, delete.text
    assert delete.json()["stream_video_id"] is None
    assert delete.json()["stream_provider"] is None


async def test_set_stream_rejects_invalid_url(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="st-owner2@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.put(
        _stream_url(remate["id"]), json={"url": "javascript:alert(1)"}, headers=_auth(token)
    )

    assert response.status_code == 422, response.text
    unchanged = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert unchanged.json()["stream_video_id"] is None


async def test_assigned_operator_can_set_stream(client: AsyncClient) -> None:
    owner = await _register_and_login(client, email="st-owner3@example.com", role="empresa")
    operator = await _register_and_login(client, email="st-rem3@example.com", role="rematador")
    remate = await _create_remate(client, owner)
    code = (
        await client.post(f"{REMATES_URL}/{remate['id']}/operator-code", headers=_auth(owner))
    ).json()["code"]
    claim = await client.post(
        f"{REMATES_URL}/{remate['id']}/claim-operator", json={"code": code}, headers=_auth(operator)
    )
    assert claim.status_code == 200, claim.text

    response = await client.put(
        _stream_url(remate["id"]),
        json={"url": f"https://www.youtube.com/watch?v={VIDEO_ID}"},
        headers=_auth(operator),
    )

    assert response.status_code == 200, response.text
    assert response.json()["stream_video_id"] == VIDEO_ID


async def test_other_company_cannot_set_stream(client: AsyncClient) -> None:
    owner = await _register_and_login(client, email="st-owner4@example.com", role="empresa")
    other = await _register_and_login(client, email="st-other4@example.com", role="empresa")
    remate = await _create_remate(client, owner)

    response = await client.put(
        _stream_url(remate["id"]), json={"url": f"https://youtu.be/{VIDEO_ID}"}, headers=_auth(other)
    )

    # Un borrador ajeno ni siquiera es visible (404), y uno visible daría 403: ambos
    # significan "no autorizado a modificarlo".
    assert response.status_code in (403, 404), response.text
    check = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(owner))
    assert check.json()["stream_video_id"] is None


async def test_anonymous_cannot_set_stream(client: AsyncClient) -> None:
    owner = await _register_and_login(client, email="st-owner5@example.com", role="empresa")
    remate = await _create_remate(client, owner)

    put = await client.put(_stream_url(remate["id"]), json={"url": f"https://youtu.be/{VIDEO_ID}"})
    delete = await client.delete(_stream_url(remate["id"]))

    assert put.status_code == 401, put.text
    assert delete.status_code == 401, delete.text


async def test_cannot_set_stream_on_cancelled_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="st-owner6@example.com", role="empresa")
    remate = await _create_remate(client, token)
    cancel = await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel", json={"reason": "Prueba de stream"}, headers=_auth(token)
    )
    assert cancel.status_code == 200, cancel.text

    response = await client.put(
        _stream_url(remate["id"]), json={"url": f"https://youtu.be/{VIDEO_ID}"}, headers=_auth(token)
    )

    assert response.status_code == 422, response.text


async def test_stream_visible_in_public_detail(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="st-owner7@example.com", role="empresa")
    remate = await _create_remate(client, token)
    await client.put(
        _stream_url(remate["id"]), json={"url": f"https://youtu.be/{VIDEO_ID}"}, headers=_auth(token)
    )

    detail = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))

    assert detail.json()["stream_video_id"] == VIDEO_ID


async def test_cannot_set_stream_on_timed_remate(client: AsyncClient) -> None:
    from datetime import UTC, datetime, timedelta

    token = await _register_and_login(client, email="st-owner8@example.com", role="empresa")
    now = datetime.now(UTC)
    created = await client.post(
        REMATES_URL,
        json={
            "title": "Remate timed",
            "category": "hacienda",
            "auction_type": "timed",
            "starts_at": (now + timedelta(hours=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
        },
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text

    response = await client.put(
        _stream_url(created.json()["id"]),
        json={"url": f"https://youtu.be/{VIDEO_ID}"},
        headers=_auth(token),
    )

    assert response.status_code == 422, response.text
    assert "Timed" in response.json()["error"]["message"]
