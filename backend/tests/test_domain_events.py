"""Tests de integración de la publicación de eventos de dominio (Épica 3, Módulo 3.2).

Para cada acción de dominio ya cubierta por los Módulos 2.1 a 2.4 (sin volver a probar
sus reglas de negocio, eso ya está en sus propios archivos de test), se verifica que
publica exactamente el evento esperado en el canal `events.<remate_id>` — suscribiéndose
a ese canal *antes* de disparar la acción vía HTTP, con `RedisPubSub` (la misma capa que
usa `RedisEventBus` en producción), y leyendo el mensaje real que llegó por Redis.
"""

import asyncio
import json
from decimal import Decimal

from httpx import AsyncClient
from redis.asyncio import Redis

from app.core.config import get_settings
from app.redis.pubsub import RedisPubSub

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _lotes_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


def _ofertas_url(remate_id: str, lote_id: str) -> str:
    return f"{_lotes_url(remate_id)}/{lote_id}/ofertas"


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "password123", "full_name": "Test", "role": role},
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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
    response = await client.post(_lotes_url(remate_id), json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _schedule(client: AsyncClient, token: str, remate_id: str) -> None:
    response = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert response.status_code == 200, response.text


async def _start(client: AsyncClient, token: str, remate_id: str) -> None:
    response = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert response.status_code == 200, response.text


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> None:
    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token)
    )
    assert response.status_code == 200, response.text


async def _setup_scheduled_remate_with_lote(
    client: AsyncClient, email: str
) -> tuple[str, str, str]:
    token = await _register_and_login(client, email=email, role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])
    return token, remate["id"], lote["id"]


async def _setup_open_lote(client: AsyncClient, email: str) -> tuple[str, str, str]:
    token, remate_id, lote_id = await _setup_scheduled_remate_with_lote(client, email)
    await _start(client, token, remate_id)
    await _open_lote(client, token, remate_id, lote_id)
    return token, remate_id, lote_id


async def _collect_events(pubsub, count: int) -> list[dict]:
    events = []
    for _ in range(count):
        message = await asyncio.wait_for(
            pubsub.get_message(timeout=1, ignore_subscribe_messages=True), timeout=3
        )
        assert message is not None, "no llegó el evento esperado a tiempo"
        events.append(json.loads(message["data"]))
    return events


class _SubscribedChannel:
    """Envoltorio de test: se suscribe a `events.<remate_id>` (mismo canal que
    `RemateScopedEvent.topic`) usando `RedisPubSub`, la misma capa de infraestructura
    que usa `RedisEventBus` en producción — no un mecanismo de test aparte."""

    def __init__(self, remate_id: str) -> None:
        self._client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
        self._pubsub_service = RedisPubSub(self._client)
        self._channel = f"events.{remate_id}"
        self._cm = None
        self.pubsub = None

    async def __aenter__(self):
        self._cm = self._pubsub_service.subscribe(self._channel)
        self.pubsub = await self._cm.__aenter__()
        # Descarta el mensaje de confirmación de suscripción.
        await asyncio.wait_for(self.pubsub.get_message(timeout=1), timeout=2)
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self._cm.__aexit__(*exc_info)
        await self._client.aclose()

    async def collect(self, count: int) -> list[dict]:
        return await _collect_events(self.pubsub, count)


# --- Remate ----------------------------------------------------------------------------


async def test_remate_created_publishes_event(client: AsyncClient) -> None:
    token = await _register_and_login(
        client, email="rematador-ev1@example.com", role="rematador"
    )

    raw_client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    raw_pubsub = raw_client.pubsub()
    await raw_pubsub.psubscribe("events.*")
    await asyncio.wait_for(raw_pubsub.get_message(timeout=1), timeout=2)

    remate = await _create_remate(client, token)

    message = await asyncio.wait_for(
        raw_pubsub.get_message(timeout=1, ignore_subscribe_messages=True), timeout=3
    )
    assert message is not None
    payload = json.loads(message["data"])
    assert payload["event_type"] == "remate.created"
    assert payload["remate_id"] == remate["id"]
    assert payload["title"] == remate["title"]
    assert payload["category"] == remate["category"]

    await raw_pubsub.punsubscribe("events.*")
    await raw_pubsub.aclose()
    await raw_client.aclose()


async def test_remate_scheduled_publishes_event(client: AsyncClient) -> None:
    token = await _register_and_login(
        client, email="rematador-ev2@example.com", role="rematador"
    )
    remate = await _create_remate(client, token)

    async with _SubscribedChannel(remate["id"]) as channel:
        await _schedule(client, token, remate["id"])
        (event,) = await channel.collect(1)

    assert event["event_type"] == "remate.scheduled"
    assert event["remate_id"] == remate["id"]


async def test_remate_started_publishes_event(client: AsyncClient) -> None:
    token, remate_id, _lote_id = await _setup_scheduled_remate_with_lote(
        client, "rematador-ev3@example.com"
    )

    async with _SubscribedChannel(remate_id) as channel:
        await _start(client, token, remate_id)
        (event,) = await channel.collect(1)

    assert event["event_type"] == "remate.started"
    assert event["remate_id"] == remate_id


async def test_remate_paused_and_resumed_publish_events(client: AsyncClient) -> None:
    token, remate_id, _lote_id = await _setup_scheduled_remate_with_lote(
        client, "rematador-ev4@example.com"
    )
    await _start(client, token, remate_id)

    async with _SubscribedChannel(remate_id) as channel:
        pause = await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(token))
        assert pause.status_code == 200
        (paused_event,) = await channel.collect(1)

        resume = await client.post(f"{REMATES_URL}/{remate_id}/resume", headers=_auth(token))
        assert resume.status_code == 200
        (resumed_event,) = await channel.collect(1)

    assert paused_event["event_type"] == "remate.paused"
    assert resumed_event["event_type"] == "remate.resumed"


async def test_remate_finished_manually_publishes_event(client: AsyncClient) -> None:
    token, remate_id, _lote_id = await _setup_scheduled_remate_with_lote(
        client, "rematador-ev5@example.com"
    )
    await _start(client, token, remate_id)

    async with _SubscribedChannel(remate_id) as channel:
        finish = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(token))
        assert finish.status_code == 200
        (event,) = await channel.collect(1)

    assert event["event_type"] == "remate.finished"
    assert event["triggered_by"] == "manual"


async def test_remate_cancelled_publishes_event(client: AsyncClient) -> None:
    token = await _register_and_login(
        client, email="rematador-ev6@example.com", role="rematador"
    )
    remate = await _create_remate(client, token)

    async with _SubscribedChannel(remate["id"]) as channel:
        response = await client.post(
            f"{REMATES_URL}/{remate['id']}/cancel",
            json={"reason": "Se retira antes de programarse."},
            headers=_auth(token),
        )
        assert response.status_code == 200
        (event,) = await channel.collect(1)

    assert event["event_type"] == "remate.cancelled"
    assert event["reason"] == "Se retira antes de programarse."


# --- Lote y finalización automática -----------------------------------------------


async def test_lote_opened_publishes_event(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_scheduled_remate_with_lote(
        client, "rematador-ev7@example.com"
    )
    await _start(client, token, remate_id)

    async with _SubscribedChannel(remate_id) as channel:
        await _open_lote(client, token, remate_id, lote_id)
        (event,) = await channel.collect(1)

    assert event["event_type"] == "lote.opened"
    assert event["lote_id"] == lote_id
    assert event["remate_id"] == remate_id


async def test_lote_cancelled_publishes_event(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev8@example.com")

    async with _SubscribedChannel(remate_id) as channel:
        response = await client.post(
            f"{_lotes_url(remate_id)}/{lote_id}/cancel",
            json={"reason": "Problema sanitario."},
            headers=_auth(token),
        )
        assert response.status_code == 200
        # Es el único lote del remate: cancelarlo también dispara la finalización
        # automática (RF-10) — dos eventos, en ese orden.
        lote_event, remate_event = await channel.collect(2)

    assert lote_event["event_type"] == "lote.cancelled"
    assert lote_event["reason"] == "Problema sanitario."
    assert remate_event["event_type"] == "remate.finished"
    assert remate_event["triggered_by"] == "auto"


async def test_lote_closed_publishes_event_and_auto_finishes_remate(
    client: AsyncClient,
) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev9@example.com")

    async with _SubscribedChannel(remate_id) as channel:
        response = await client.post(
            f"{_lotes_url(remate_id)}/{lote_id}/close",
            json={"outcome": "sold", "final_price": "1500.00"},
            headers=_auth(token),
        )
        assert response.status_code == 200
        lote_event, remate_event = await channel.collect(2)

    assert lote_event["event_type"] == "lote.closed"
    assert lote_event["outcome"] == "sold"
    assert Decimal(str(lote_event["final_price"])) == Decimal("1500.00")
    assert remate_event["event_type"] == "remate.finished"
    assert remate_event["triggered_by"] == "auto"


# --- Ofertas -----------------------------------------------------------------------


async def test_oferta_accepted_publishes_placed_and_accepted_events(
    client: AsyncClient,
) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev10@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador-ev10@example.com", role="comprador"
    )

    async with _SubscribedChannel(remate_id) as channel:
        response = await client.post(
            _ofertas_url(remate_id, lote_id),
            json={"amount": "1000.00"},
            headers=_auth(comprador_token),
        )
        assert response.status_code == 201
        placed_event, accepted_event = await channel.collect(2)

    assert placed_event["event_type"] == "oferta.placed"
    assert placed_event["status"] == "accepted"
    assert accepted_event["event_type"] == "oferta.accepted"
    assert Decimal(str(accepted_event["amount"])) == Decimal("1000.00")


async def test_oferta_rejected_publishes_placed_and_rejected_events(
    client: AsyncClient,
) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev11@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador-ev11@example.com", role="comprador"
    )

    async with _SubscribedChannel(remate_id) as channel:
        response = await client.post(
            _ofertas_url(remate_id, lote_id),
            json={"amount": "500.00"},
            headers=_auth(comprador_token),
        )
        assert response.status_code == 201
        placed_event, rejected_event = await channel.collect(2)

    assert placed_event["event_type"] == "oferta.placed"
    assert placed_event["status"] == "rejected"
    assert rejected_event["event_type"] == "oferta.rejected"
    assert rejected_event["reason"]


async def test_oferta_winner_changed_published_when_outbid(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev12@example.com")
    comprador_a = await _register_and_login(
        client, email="comprador-ev12a@example.com", role="comprador"
    )
    comprador_b = await _register_and_login(
        client, email="comprador-ev12b@example.com", role="comprador"
    )

    first = await client.post(
        _ofertas_url(remate_id, lote_id), json={"amount": "1000.00"}, headers=_auth(comprador_a)
    )
    assert first.status_code == 201
    first_oferta_id = first.json()["id"]

    async with _SubscribedChannel(remate_id) as channel:
        second = await client.post(
            _ofertas_url(remate_id, lote_id),
            json={"amount": "1200.00"},
            headers=_auth(comprador_b),
        )
        assert second.status_code == 201
        placed_event, accepted_event, winner_changed_event = await channel.collect(3)

    assert placed_event["event_type"] == "oferta.placed"
    assert accepted_event["event_type"] == "oferta.accepted"
    assert winner_changed_event["event_type"] == "oferta.winner_changed"
    assert winner_changed_event["previous_oferta_id"] == first_oferta_id
    assert winner_changed_event["new_oferta_id"] == second.json()["id"]


async def test_idempotent_replay_does_not_republish_events(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_open_lote(client, "rematador-ev13@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador-ev13@example.com", role="comprador"
    )

    first = await client.post(
        _ofertas_url(remate_id, lote_id),
        json={"amount": "1000.00", "client_token": "retry-events-1"},
        headers=_auth(comprador_token),
    )
    assert first.status_code == 201

    async with _SubscribedChannel(remate_id) as channel:
        second = await client.post(
            _ofertas_url(remate_id, lote_id),
            json={"amount": "1000.00", "client_token": "retry-events-1"},
            headers=_auth(comprador_token),
        )
        assert second.status_code == 201
        assert second.json()["id"] == first.json()["id"]

        # Nada nuevo ocurrió: no debería haber ningún mensaje esperando en el canal.
        message = await asyncio.wait_for(
            channel.pubsub.get_message(timeout=1, ignore_subscribe_messages=True), timeout=2
        )
    assert message is None
