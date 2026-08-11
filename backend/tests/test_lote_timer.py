"""Tests del sistema de cuenta regresiva y cierre automático de lotes (Épica 8). Ver
docs/40-cuenta-regresiva-y-cierre-automatico.md y ADR-007/ADR-043.

Cubren: arranque del timer al abrir un lote, extensión anti-sniping, las cinco acciones
del rematador (pausar/reanudar/reiniciar/modificar/alternar cierre automático), cierre
automático y adjudicación (`TimerExpiryScheduler`, ejercitado directo vía `tick()`, sin
la tarea de fondo), y la serialización por lock de fila entre un bid concurrente y el
scheduler.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.events.base import DomainEvent
from app.modules.remates.lotes.models import Lote
from app.timer.scheduler import TimerExpiryScheduler

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _RecordingEventBus:
    """Mismo patrón que `test_chat_service.py::_RecordingEventBus` -- registra los
    eventos publicados en memoria, sin depender de Redis para verificarlos."""

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


def _timer_url(remate_id: str, lote_id: str, action: str) -> str:
    return f"{_lotes_url(remate_id)}/{lote_id}/timer/{action}"


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


async def _setup_open_lote_with_timer(
    client: AsyncClient,
    owner_email: str,
    *,
    lote_timer_seconds: int = 30,
    anti_sniping_enabled: bool = False,
    anti_sniping_extension_seconds: int = 10,
) -> tuple[str, str, str]:
    """Rematador con un remate LIVE (timer configurado) y un lote OPEN. Devuelve
    (owner_token, remate_id, lote_id)."""
    owner_token = await _register_and_login(client, email=owner_email, role="rematador")
    remate = await _create_remate(
        client,
        owner_token,
        settings={
            "lote_timer_seconds": lote_timer_seconds,
            "anti_sniping_enabled": anti_sniping_enabled,
            "anti_sniping_extension_seconds": anti_sniping_extension_seconds,
        },
    )
    lote = await _create_lote(client, owner_token, remate["id"])
    schedule = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    start = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    assert start.status_code == 200, start.text
    open_response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token)
    )
    assert open_response.status_code == 200, open_response.text
    return owner_token, remate["id"], lote["id"]


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str):
    return await client.post(
        _ofertas_url(remate_id, lote_id), json={"amount": amount}, headers=_auth(token)
    )


async def _get_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> dict:
    response = await client.get(f"{_lotes_url(remate_id)}/{lote_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


@pytest_asyncio.fixture
async def timer_session_factory(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Mismo `db_engine` que ya usa el fixture `client` (ver `tests/conftest.py`) --
    necesario para que `TimerExpiryScheduler.tick()` (que abre su propia sesión, igual
    que en producción) vea los mismos datos que el `client` de la prueba ya escribió."""
    return async_sessionmaker(bind=db_engine, expire_on_commit=False)


def _make_scheduler(
    session_factory: async_sessionmaker[AsyncSession], event_bus: _RecordingEventBus
) -> TimerExpiryScheduler:
    return TimerExpiryScheduler(session_factory, event_bus, get_settings())


async def _force_expire(db_session: AsyncSession, lote_id: str, *, seconds_ago: int = 1) -> None:
    """Fija `timer_ends_at` en el pasado directamente en la base -- evita que el test
    tenga que esperar segundos reales para ejercitar el scheduler."""
    await _set_timer_ends_in(db_session, lote_id, seconds=-seconds_ago)


async def _set_timer_ends_in(db_session: AsyncSession, lote_id: str, *, seconds: int) -> None:
    """Fija `timer_ends_at` a `seconds` desde ahora (negativo = ya vencido) --
    manipulación directa de la base para no depender de esperar tiempo real en el test."""
    lote = await db_session.get(Lote, lote_id)
    assert lote is not None
    lote.timer_ends_at = datetime.now(UTC) + timedelta(seconds=seconds)
    await db_session.commit()


# --- Arranque del timer -------------------------------------------------------------


async def test_opening_a_lote_starts_the_timer_when_configured(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner1@example.com", lote_timer_seconds=30
    )
    owner_token = _owner_token
    lote = await _get_lote(client, owner_token, remate_id, lote_id)
    assert lote["timer_ends_at"] is not None
    assert lote["timer_auto_close_enabled"] is True
    assert lote["timer_paused_remaining_seconds"] is None


async def test_opening_a_lote_without_timer_configured_leaves_it_null(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="timer-owner2@example.com", role="rematador")
    remate = await _create_remate(client, owner_token)  # sin settings.lote_timer_seconds
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    await client.post(f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token))

    lote_after = await _get_lote(client, owner_token, remate["id"], lote["id"])
    assert lote_after["timer_ends_at"] is None


# --- Extensión anti-sniping ----------------------------------------------------------


async def test_bid_within_window_extends_timer(client: AsyncClient, db_session: AsyncSession) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client,
        "timer-owner3@example.com",
        lote_timer_seconds=300,
        anti_sniping_enabled=True,
        anti_sniping_extension_seconds=15,
    )
    await _set_timer_ends_in(db_session, lote_id, seconds=5)  # quedan 5s (dentro de la ventana de 15s)

    comprador_token = await _register_and_login(client, email="timer-buyer3@example.com", role="comprador")
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "accepted"

    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    ends_at = datetime.fromisoformat(lote_after["timer_ends_at"])
    remaining = (ends_at - datetime.now(UTC)).total_seconds()
    assert 13 <= remaining <= 16, f"esperaba ~15s restantes tras la extensión, quedan {remaining}"


async def test_bid_outside_window_does_not_extend_timer(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client,
        "timer-owner4@example.com",
        lote_timer_seconds=300,
        anti_sniping_enabled=True,
        anti_sniping_extension_seconds=10,
    )
    lote_before = await _get_lote(client, owner_token, remate_id, lote_id)
    ends_at_before = datetime.fromisoformat(lote_before["timer_ends_at"])

    comprador_token = await _register_and_login(client, email="timer-buyer4@example.com", role="comprador")
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "accepted"

    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    ends_at_after = datetime.fromisoformat(lote_after["timer_ends_at"])
    # Quedaban ~300s, muy por fuera de la ventana de 10s -- no debería haber cambiado.
    assert abs((ends_at_after - ends_at_before).total_seconds()) < 2


async def test_bid_within_window_but_anti_sniping_disabled_does_not_extend(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client,
        "timer-owner5@example.com",
        lote_timer_seconds=300,
        anti_sniping_enabled=False,
        anti_sniping_extension_seconds=15,
    )
    await _set_timer_ends_in(db_session, lote_id, seconds=5)

    comprador_token = await _register_and_login(client, email="timer-buyer5@example.com", role="comprador")
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201

    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    ends_at = datetime.fromisoformat(lote_after["timer_ends_at"])
    remaining = (ends_at - datetime.now(UTC)).total_seconds()
    # Seguía en ~5s (lo que se fijó manualmente) menos lo que tardó el request -- sin
    # anti-sniping habilitado, nunca debería haber saltado a los 15s de la ventana.
    assert remaining < 5, "sin anti-sniping habilitado, no debería haberse extendido a la ventana completa"


# --- Acciones del rematador ----------------------------------------------------------


async def test_owner_can_pause_and_resume_timer(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner6@example.com", lote_timer_seconds=300
    )

    pause = await client.post(_timer_url(remate_id, lote_id, "pause"), headers=_auth(owner_token))
    assert pause.status_code == 200, pause.text
    assert pause.json()["timer_ends_at"] is None
    assert pause.json()["timer_paused_remaining_seconds"] is not None
    assert 295 <= pause.json()["timer_paused_remaining_seconds"] <= 300

    resume = await client.post(_timer_url(remate_id, lote_id, "resume"), headers=_auth(owner_token))
    assert resume.status_code == 200, resume.text
    assert resume.json()["timer_ends_at"] is not None
    assert resume.json()["timer_paused_remaining_seconds"] is None


async def test_pausing_an_already_paused_timer_fails(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner7@example.com", lote_timer_seconds=300
    )
    await client.post(_timer_url(remate_id, lote_id, "pause"), headers=_auth(owner_token))
    second_pause = await client.post(_timer_url(remate_id, lote_id, "pause"), headers=_auth(owner_token))
    assert second_pause.status_code == 422


async def test_owner_can_reset_timer_to_full_duration(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner8@example.com", lote_timer_seconds=60
    )
    reset = await client.post(_timer_url(remate_id, lote_id, "reset"), headers=_auth(owner_token))
    assert reset.status_code == 200, reset.text
    ends_at = datetime.fromisoformat(reset.json()["timer_ends_at"])
    remaining = (ends_at - datetime.now(UTC)).total_seconds()
    assert 57 <= remaining <= 60


async def test_owner_can_set_remaining_time_manually(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner9@example.com", lote_timer_seconds=300
    )
    response = await client.post(
        _timer_url(remate_id, lote_id, "remaining"),
        json={"seconds": 42},
        headers=_auth(owner_token),
    )
    assert response.status_code == 200, response.text
    ends_at = datetime.fromisoformat(response.json()["timer_ends_at"])
    remaining = (ends_at - datetime.now(UTC)).total_seconds()
    assert 39 <= remaining <= 42


async def test_owner_can_disable_auto_close(client: AsyncClient, db_session: AsyncSession) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner10@example.com", lote_timer_seconds=300
    )
    response = await client.post(
        _timer_url(remate_id, lote_id, "auto-close"),
        json={"enabled": False},
        headers=_auth(owner_token),
    )
    assert response.status_code == 200, response.text
    assert response.json()["timer_auto_close_enabled"] is False


async def test_non_owner_cannot_control_timer(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner11@example.com", lote_timer_seconds=300
    )
    other_rematador = await _register_and_login(
        client, email="timer-other11@example.com", role="rematador"
    )
    response = await client.post(_timer_url(remate_id, lote_id, "pause"), headers=_auth(other_rematador))
    assert response.status_code == 403


# --- Cierre automático y adjudicación (TimerExpiryScheduler) -------------------------


async def test_scheduler_closes_expired_lote_as_unsold_without_bids(
    client: AsyncClient,
    db_session: AsyncSession,
    timer_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner12@example.com", lote_timer_seconds=30
    )
    await _force_expire(db_session, lote_id)

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(timer_session_factory, event_bus)
    closed_count = await scheduler.tick()

    assert closed_count == 1
    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    assert lote_after["status"] == "closed_unsold"
    assert "lote.timer_expired" in event_bus.published_types()
    assert "lote.closed" in event_bus.published_types()
    assert "lote.winner_determined" not in event_bus.published_types()


async def test_scheduler_closes_expired_lote_as_sold_and_awards_leading_bidder(
    client: AsyncClient,
    db_session: AsyncSession,
    timer_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner13@example.com", lote_timer_seconds=30
    )
    comprador_token = await _register_and_login(client, email="timer-buyer13@example.com", role="comprador")
    bid = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert bid.json()["status"] == "accepted"

    await _force_expire(db_session, lote_id)

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(timer_session_factory, event_bus)
    closed_count = await scheduler.tick()

    assert closed_count == 1
    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    assert lote_after["status"] == "closed_sold"
    assert Decimal(str(lote_after["final_price"])) == Decimal("1000.00")

    winner_events = [e for e in event_bus.published if e.event_type == "lote.winner_determined"]
    assert len(winner_events) == 1
    assert Decimal(str(winner_events[0].amount)) == Decimal("1000.00")


async def test_scheduler_skips_lote_with_auto_close_disabled(
    client: AsyncClient,
    db_session: AsyncSession,
    timer_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner14@example.com", lote_timer_seconds=30
    )
    await client.post(
        _timer_url(remate_id, lote_id, "auto-close"), json={"enabled": False}, headers=_auth(owner_token)
    )
    await _force_expire(db_session, lote_id)

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(timer_session_factory, event_bus)
    closed_count = await scheduler.tick()

    assert closed_count == 0
    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    assert lote_after["status"] == "open"


async def test_scheduler_skips_expired_lote_while_remate_is_paused(
    client: AsyncClient,
    db_session: AsyncSession,
    timer_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner15@example.com", lote_timer_seconds=30
    )
    await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(owner_token))
    await _force_expire(db_session, lote_id)

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(timer_session_factory, event_bus)
    closed_count = await scheduler.tick()

    assert closed_count == 0
    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    assert lote_after["status"] == "open"


# --- Concurrencia: bid vs. scheduler ---------------------------------------------------


async def test_concurrent_bid_and_scheduler_never_leave_an_inconsistent_state(
    client: AsyncClient,
    db_session: AsyncSession,
    timer_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Un bid y una corrida del scheduler casi al mismo tiempo sobre el mismo lote --
    el lock de fila (ADR-004, reusado por el scheduler) garantiza que el resultado
    final sea consistente pase lo que pase con el orden real: o el bid se aceptó ANTES
    de que el scheduler lo evaluara (el lote sigue `OPEN` con esa oferta) o el
    scheduler cerró el lote ANTES de que el bid se procesara (el bid se rechaza por
    lote no abierto) -- nunca una oferta `accepted` sobre un lote ya `closed`."""
    owner_token, remate_id, lote_id = await _setup_open_lote_with_timer(
        client, "timer-owner16@example.com", lote_timer_seconds=30
    )
    comprador_token = await _register_and_login(client, email="timer-buyer16@example.com", role="comprador")
    await _force_expire(db_session, lote_id)

    event_bus = _RecordingEventBus()
    scheduler = _make_scheduler(timer_session_factory, event_bus)

    bid_response, _closed_count = await asyncio.gather(
        _bid(client, comprador_token, remate_id, lote_id, "1000.00"),
        scheduler.tick(),
    )

    lote_after = await _get_lote(client, owner_token, remate_id, lote_id)
    if bid_response.status_code == 201 and bid_response.json()["status"] == "accepted":
        # El bid ganó la carrera: el lote puede seguir abierto (el scheduler lo vio
        # todavía vigente y no hizo nada) o ya haber sido cerrado adjudicándolo a esta
        # misma oferta -- ambos son consistentes.
        if lote_after["status"] == "closed_sold":
            assert Decimal(str(lote_after["final_price"])) == Decimal("1000.00")
        else:
            assert lote_after["status"] == "open"
    else:
        # El scheduler ganó la carrera: el lote ya estaba cerrado cuando el bid llegó
        # al lock, así que se rechazó por "no está abierto".
        assert lote_after["status"] in ("closed_sold", "closed_unsold")

    # Invariante final, sin importar el orden: nunca queda una oferta `accepted` sobre
    # un lote que terminó `closed_unsold` (se habría perdido el registro del ganador).
    if lote_after["status"] == "closed_unsold":
        assert bid_response.status_code != 201 or bid_response.json()["status"] != "accepted"
