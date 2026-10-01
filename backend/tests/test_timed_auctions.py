"""Tests de la modalidad Timed Auction (TIMED) -- ver plan de implementación.

Cubren: validación de creación (fechas/anti-sniping obligatorios para TIMED, cuenta
regresiva por lote no aplica), que las acciones manuales de LIVE (abrir/cerrar lote,
iniciar remate, reencolar desierto, controlar timer por lote) queden rechazadas para
TIMED, que el invariante RF-12 (a lo sumo un lote OPEN) NO aplique a TIMED (varios lotes
abiertos en paralelo, ofertas concurrentes en lotes distintos), anti-sniping con ventana
y duración independientes, y el ciclo de vida automático completo
(`TimedAuctionLifecycleScheduler`: auto-inicio, auto-finalización, pausa/reanudación
masiva) ejercitado directo vía `tick()`, sin la tarea de fondo real -- mismo patrón que
`test_lote_timer.py`.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.events.base import DomainEvent
from app.modules.remates.models import Remate
from app.timer.timed_scheduler import TimedAuctionLifecycleScheduler
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)

    def published_types(self) -> list[str]:
        return [event.event_type for event in self.published]  # type: ignore[attr-defined]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _lotes_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


def _ofertas_url(remate_id: str, lote_id: str) -> str:
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


async def _create_remate_raw(client: AsyncClient, token: str, payload: dict):
    return await client.post(REMATES_URL, json=payload, headers=_auth(token))


def _timed_payload(**overrides) -> dict:
    now = datetime.now(UTC)
    payload = {
        "title": "Remate timed",
        "category": "hacienda",
        "auction_type": "timed",
        "starts_at": (now + timedelta(seconds=3)).isoformat(),
        "ends_at": (now + timedelta(days=1)).isoformat(),
    }
    payload.update(overrides)
    return payload


async def _create_timed_remate(client: AsyncClient, token: str, **overrides) -> dict:
    response = await _create_remate_raw(client, token, _timed_payload(**overrides))
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


async def _get_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> dict:
    response = await client.get(f"{_lotes_url(remate_id)}/{lote_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _get_remate(client: AsyncClient, token: str, remate_id: str) -> dict:
    response = await client.get(f"{REMATES_URL}/{remate_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str):
    return await client.post(
        _ofertas_url(remate_id, lote_id), json={"amount": amount}, headers=_auth(token)
    )


async def _force_starts_at_in_past(
    db_session: AsyncSession, remate_id: str, *, seconds_ago: int = 1
) -> None:
    """Fija `starts_at` en el pasado directamente en la base, para que el scheduler lo
    trate como vencido sin tener que esperar tiempo real -- mismo criterio que
    `test_lote_timer.py::_force_expire`."""
    remate = await db_session.get(Remate, remate_id)
    assert remate is not None
    remate.starts_at = datetime.now(UTC) - timedelta(seconds=seconds_ago)
    await db_session.commit()


@pytest_asyncio.fixture
async def timed_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Mismo `db_engine` que ya usa el fixture `client` -- necesario para que
    `TimedAuctionLifecycleScheduler.tick()` (que abre su propia sesión, igual que en
    producción) vea los mismos datos que el `client` de la prueba ya escribió."""
    return async_sessionmaker(bind=db_engine, expire_on_commit=False)


def _make_scheduler(
    session_factory: async_sessionmaker[AsyncSession], event_bus: _RecordingEventBus
) -> TimedAuctionLifecycleScheduler:
    return TimedAuctionLifecycleScheduler(session_factory, event_bus, get_settings())


async def _schedule_and_prime_start(
    client: AsyncClient, db_session: AsyncSession, owner_token: str, remate_id: str
) -> None:
    schedule = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    await _force_starts_at_in_past(db_session, remate_id)


# --- Validación de creación ----------------------------------------------------------


async def test_timed_requires_ends_at(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timed-c1@example.com", role="empresa")
    payload = _timed_payload()
    payload["ends_at"] = None
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_timed_requires_starts_at(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timed-c2@example.com", role="empresa")
    payload = _timed_payload()
    payload["starts_at"] = None
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_timed_anti_sniping_enabled_requires_window_and_duration(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timed-c3@example.com", role="empresa")
    payload = _timed_payload(settings={"anti_sniping_enabled": True})
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_timed_with_complete_anti_sniping_settings_succeeds(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timed-c4@example.com", role="empresa")
    payload = _timed_payload(
        settings={
            "anti_sniping_enabled": True,
            "timed_extension_window_seconds": 60,
            "timed_extension_duration_seconds": 120,
        }
    )
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 201, response.text
    assert response.json()["auction_type"] == "timed"


async def test_timed_rejects_lote_timer_seconds(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timed-c5@example.com", role="empresa")
    payload = _timed_payload(settings={"lote_timer_seconds": 30})
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_live_creation_unaffected_by_timed_validation(client: AsyncClient) -> None:
    """Regresión: un LIVE sin ends_at, sin auction_type explícito, sigue funcionando
    exactamente igual que antes de esta feature."""
    owner_token = await _register_and_login(client, email="timed-c6@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)
    assert remate["auction_type"] == "live"
    assert remate["ends_at"] is None


async def test_ends_at_frozen_once_timed_remate_is_scheduled(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token = await _register_and_login(client, email="timed-c7@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    schedule = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text

    new_ends_at = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    response = await client.patch(
        f"{REMATES_URL}/{remate['id']}", json={"ends_at": new_ends_at}, headers=_auth(owner_token)
    )
    assert response.status_code == 422, response.text


# --- Acciones manuales de LIVE rechazadas para TIMED ----------------------------------


async def test_manual_start_rejected_for_timed(client: AsyncClient, db_session: AsyncSession) -> None:
    owner_token = await _register_and_login(client, email="timed-m1@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    response = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    assert response.status_code == 422, response.text


async def test_manual_open_rejected_for_timed(client: AsyncClient, db_session: AsyncSession) -> None:
    owner_token = await _register_and_login(client, email="timed-m2@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token)
    )
    assert response.status_code == 422, response.text


async def test_manual_close_rejected_for_timed(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-m3@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    await scheduler.tick()

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/close",
        json={"outcome": "unsold"},
        headers=_auth(owner_token),
    )
    assert response.status_code == 422, response.text


async def test_requeue_rejected_for_timed(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-m4@example.com", role="empresa")
    remate = await _create_timed_remate(
        client, owner_token, ends_at=(datetime.now(UTC) + timedelta(seconds=8)).isoformat()
    )
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(
        timed_session_factory, event_bus
    )
    await scheduler.tick()
    # Deja vencer el lote (ends_at ya casi llegó) y cierra vía TimerExpiryScheduler.
    from app.timer.scheduler import TimerExpiryScheduler

    close_scheduler = TimerExpiryScheduler(
        timed_session_factory,
        event_bus,
        get_settings(),
    )
    await asyncio.sleep(8.5)
    await close_scheduler.tick()

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/requeue", json={}, headers=_auth(owner_token)
    )
    assert response.status_code == 422, response.text


# --- Invariante RF-12 relajado: lotes en paralelo -------------------------------------


async def test_timed_opens_all_pending_lotes_in_parallel(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-p1@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote1 = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(
        timed_session_factory, event_bus
    )
    result = await scheduler.tick()
    assert result["started"] == 1

    remate_after = await _get_remate(client, owner_token, remate["id"])
    assert remate_after["status"] == "live"
    lote1_after = await _get_lote(client, owner_token, remate["id"], lote1["id"])
    lote2_after = await _get_lote(client, owner_token, remate["id"], lote2["id"])
    assert lote1_after["status"] == "open"
    assert lote2_after["status"] == "open"
    assert lote1_after["timer_ends_at"] is not None
    assert lote2_after["timer_ends_at"] is not None
    assert "remate.started" in event_bus.published_types()
    assert event_bus.published_types().count("lote.opened") == 2


async def test_timed_skips_auto_start_without_any_lote(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-p2@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    # Sin lotes -- RF-08 se mantiene incluso para el auto-inicio.
    schedule = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    await _force_starts_at_in_past(db_session, remate["id"])

    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    result = await scheduler.tick()
    assert result["started"] == 0

    remate_after = await _get_remate(client, owner_token, remate["id"])
    assert remate_after["status"] == "scheduled"


async def test_concurrent_bids_on_different_timed_lotes_both_succeed(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-p3@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote1 = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    await scheduler.tick()

    buyer_token = await _register_and_login(client, email="timed-buyer3@example.com", role="comprador")
    results = await asyncio.gather(
        _bid(client, buyer_token, remate["id"], lote1["id"], "1100.00"),
        _bid(client, buyer_token, remate["id"], lote2["id"], "1100.00"),
    )
    for response in results:
        assert response.status_code == 201, response.text
        assert response.json()["status"] == "accepted"


# --- Anti-sniping: ventana y duración independientes ----------------------------------


async def test_timed_anti_sniping_extends_only_the_bid_lote(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-a1@example.com", role="empresa")
    remate = await _create_timed_remate(
        client,
        owner_token,
        settings={
            "anti_sniping_enabled": True,
            "timed_extension_window_seconds": 30,
            "timed_extension_duration_seconds": 90,
        },
    )
    lote1 = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    await scheduler.tick()

    from app.modules.remates.lotes.models import Lote

    lote1_row = await db_session.get(Lote, lote1["id"])
    assert lote1_row is not None
    lote1_row.timer_ends_at = datetime.now(UTC) + timedelta(seconds=10)  # dentro de la ventana de 30s
    await db_session.commit()
    lote2_before = await _get_lote(client, owner_token, remate["id"], lote2["id"])
    lote2_ends_before = datetime.fromisoformat(lote2_before["timer_ends_at"])

    buyer_token = await _register_and_login(client, email="timed-buyer-a1@example.com", role="comprador")
    response = await _bid(client, buyer_token, remate["id"], lote1["id"], "1100.00")
    assert response.status_code == 201, response.text

    lote1_after = await _get_lote(client, owner_token, remate["id"], lote1["id"])
    ends_at = datetime.fromisoformat(lote1_after["timer_ends_at"])
    remaining = (ends_at - datetime.now(UTC)).total_seconds()
    assert 87 <= remaining <= 91, f"esperaba ~90s (duración), quedan {remaining}"

    lote2_after = await _get_lote(client, owner_token, remate["id"], lote2["id"])
    ends_at_2 = datetime.fromisoformat(lote2_after["timer_ends_at"])
    assert abs((ends_at_2 - lote2_ends_before).total_seconds()) < 2  # el hermano no se tocó


# --- Ciclo de vida automático: auto-finalización y pausa/reanudación masiva -----------


async def test_timed_auto_finishes_once_all_lotes_are_terminal(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-f1@example.com", role="empresa")
    remate = await _create_timed_remate(
        client, owner_token, ends_at=(datetime.now(UTC) + timedelta(seconds=8)).isoformat()
    )
    await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    event_bus = _RecordingEventBus()
    session_factory = timed_session_factory
    start_scheduler = _make_scheduler(session_factory, event_bus)
    await start_scheduler.tick()

    from app.timer.scheduler import TimerExpiryScheduler

    await asyncio.sleep(8.5)
    close_scheduler = TimerExpiryScheduler(session_factory, event_bus, get_settings())
    await close_scheduler.tick()

    finish_scheduler = _make_scheduler(session_factory, event_bus)
    result = await finish_scheduler.tick()
    assert result["finished"] == 1

    remate_after = await _get_remate(client, owner_token, remate["id"])
    assert remate_after["status"] == "finished"
    assert "remate.finished" in event_bus.published_types()


async def test_live_remate_never_auto_finishes_via_timed_scheduler(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """Regresión: el scheduler nuevo filtra por auction_type == TIMED antes de mirar
    nada más -- un LIVE cuyo único lote cierra sigue LIVE (RF-10/ADR-019 siguen sin
    efecto), sin que este scheduler nuevo lo alcance."""
    owner_token = await _register_and_login(client, email="timed-f2@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token)
    )
    await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/close",
        json={"outcome": "unsold"},
        headers=_auth(owner_token),
    )

    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    result = await scheduler.tick()
    assert result["finished"] == 0

    remate_after = await _get_remate(client, owner_token, remate["id"])
    assert remate_after["status"] == "live"


async def test_pausing_timed_remate_freezes_all_open_lotes(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-pz1@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote1 = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    await scheduler.tick()

    pause = await client.post(f"{REMATES_URL}/{remate['id']}/pause", headers=_auth(owner_token))
    assert pause.status_code == 200, pause.text

    lote1_after = await _get_lote(client, owner_token, remate["id"], lote1["id"])
    lote2_after = await _get_lote(client, owner_token, remate["id"], lote2["id"])
    assert lote1_after["timer_ends_at"] is None
    assert lote1_after["timer_paused_remaining_seconds"] is not None
    assert lote2_after["timer_ends_at"] is None
    assert lote2_after["timer_paused_remaining_seconds"] is not None

    resume = await client.post(f"{REMATES_URL}/{remate['id']}/resume", headers=_auth(owner_token))
    assert resume.status_code == 200, resume.text

    lote1_resumed = await _get_lote(client, owner_token, remate["id"], lote1["id"])
    lote2_resumed = await _get_lote(client, owner_token, remate["id"], lote2["id"])
    assert lote1_resumed["timer_ends_at"] is not None
    assert lote1_resumed["timer_paused_remaining_seconds"] is None
    assert lote2_resumed["timer_ends_at"] is not None
    assert lote2_resumed["timer_paused_remaining_seconds"] is None


# --- Historial de ofertas por lote, enmascarado para compradores ---------------------


def _recent_offers_url(remate_id: str, lote_id: str) -> str:
    return f"{_ofertas_url(remate_id, lote_id)}/recientes"


async def _open_two_lotes_with_a_bid(
    client: AsyncClient,
    db_session: AsyncSession,
    timed_session_factory,
    owner_token: str,
    *,
    buyer_email: str,
) -> tuple[dict, dict, dict, str]:
    """Remate TIMED con dos lotes `open` en paralelo, una oferta aceptada en el primero
    -- setup compartido por los tests de `/ofertas/recientes` de abajo. `buyer_email`
    lo elige cada test (nunca repetido) -- el rate limit de login es por email
    (`AuthService.authenticate`, `login:{email}`), así que reusar uno solo entre varios
    tests de este archivo dispara un 429 apenas se acumulan suficientes intentos."""
    remate = await _create_timed_remate(client, owner_token)
    lote1 = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(timed_session_factory, _RecordingEventBus())
    await scheduler.tick()

    buyer_token = await _register_and_login(client, email=buyer_email, role="comprador")
    bid = await _bid(client, buyer_token, remate["id"], lote1["id"], "1100.00")
    assert bid.status_code == 201, bid.text
    return remate, lote1, lote2, buyer_token


async def test_lote_recent_offers_masks_buyer_id_for_a_bystander_buyer(
    client: AsyncClient,
    db_session: AsyncSession,
    timed_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_token = await _register_and_login(client, email="timed-r1@example.com", role="empresa")
    remate, lote1, _lote2, _buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer1@example.com",
    )
    stranger_token = await _register_and_login(
        client, email="timed-r1-stranger@example.com", role="comprador"
    )

    response = await client.get(
        _recent_offers_url(remate["id"], lote1["id"]), headers=_auth(stranger_token)
    )

    assert response.status_code == 200, response.text
    offers = response.json()
    assert len(offers) == 1
    assert offers[0]["amount"] == "1100.00"
    assert offers[0]["buyer_id"] is None
    assert offers[0]["status"] == "accepted"


async def test_lote_recent_offers_reveals_own_buyer_id_to_its_author(
    client: AsyncClient,
    db_session: AsyncSession,
    timed_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Mismo bug/fix que `SnapshotService._mask_oferta` (Sala LIVE): el anonimato de
    ADR-031 es entre postores, no de uno mismo -- ver `test_snapshot_service.py::
    test_snapshot_reveals_own_buyer_id_to_the_leading_bidder`."""
    owner_token = await _register_and_login(client, email="timed-r1b@example.com", role="empresa")
    remate, lote1, _lote2, buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer1b@example.com",
    )

    response = await client.get(
        _recent_offers_url(remate["id"], lote1["id"]), headers=_auth(buyer_token)
    )

    assert response.status_code == 200, response.text
    offers = response.json()
    assert len(offers) == 1
    assert offers[0]["buyer_id"] is not None


async def test_lote_recent_offers_only_includes_that_lote(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """Dos lotes `open` en paralelo -- el historial de uno no arrastra ofertas del otro
    (RF relajado de Timed Auctions, ver el resto de este archivo)."""
    owner_token = await _register_and_login(client, email="timed-r2@example.com", role="empresa")
    remate, lote1, lote2, buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer2@example.com",
    )

    response = await client.get(_recent_offers_url(remate["id"], lote2["id"]), headers=_auth(buyer_token))

    assert response.status_code == 200, response.text
    assert response.json() == []


async def test_lote_recent_offers_unmasked_for_owner(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-r3@example.com", role="empresa")
    remate, lote1, _lote2, _buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer3@example.com",
    )

    response = await client.get(_recent_offers_url(remate["id"], lote1["id"]), headers=_auth(owner_token))

    assert response.status_code == 200, response.text
    assert response.json()[0]["buyer_id"] is not None


async def test_lote_recent_offers_visible_to_anonymous_visitor(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """ADR-049: mismo criterio que `/ofertas/leading` -- visible sin sesión, con
    `buyer_id` igual de enmascarado que para un comprador logueado."""
    owner_token = await _register_and_login(client, email="timed-r4@example.com", role="empresa")
    remate, lote1, _lote2, _buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer4@example.com",
    )

    response = await client.get(_recent_offers_url(remate["id"], lote1["id"]))

    assert response.status_code == 200, response.text
    assert response.json()[0]["buyer_id"] is None


async def test_lote_recent_offers_404_when_lote_belongs_to_another_remate(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-r5@example.com", role="empresa")
    remate, lote1, _lote2, buyer_token = await _open_two_lotes_with_a_bid(
        client,
        db_session,
        timed_session_factory,
        owner_token,
        buyer_email="timed-recent-buyer5@example.com",
    )
    other_remate = await _create_timed_remate(client, owner_token, title="Otro remate timed")

    response = await client.get(
        _recent_offers_url(other_remate["id"], lote1["id"]), headers=_auth(buyer_token)
    )

    assert response.status_code == 404, response.text


async def test_single_lote_timer_actions_rejected_for_timed(
    client: AsyncClient, db_session: AsyncSession, timed_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    owner_token = await _register_and_login(client, email="timed-tz1@example.com", role="empresa")
    remate = await _create_timed_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_and_prime_start(client, db_session, owner_token, remate["id"])
    scheduler = _make_scheduler(
        timed_session_factory, _RecordingEventBus()
    )
    await scheduler.tick()

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/timer/pause", headers=_auth(owner_token)
    )
    assert response.status_code == 422, response.text
