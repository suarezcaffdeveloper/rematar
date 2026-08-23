"""Tests de integración de punta a punta del enmascarado de eventos por destinatario
(Fase 1 de remediación del WebSocket Security Audit -- ver `app/realtime/privilege.py`).

Mismo estilo y mismos fixtures que `test_realtime_sync.py` (publicar con
`RedisEventBus` real, sobre un cliente Redis propio del loop del test; recibir por un
WebSocket real vía `ws_client`/`TestClient`) -- acá, además, se arma estado de dominio
real (un `Remate` con dueño real, un admin insertado directamente como en
`test_roles.py`) para que `RealtimePrivilegeResolver` resuelva ownership/rol contra
Postgres de verdad, no contra un doble de prueba.

No se reproduce el pipeline completo de detección de moderación (5 ofertas inválidas
reales dentro de la ventana, etc. -- eso ya lo cubre `test_moderation_service.py`/
`test_moderation_realtime.py`, sin cambios en esta fase): acá se publica
`ModerationInvalidBidThresholdExceeded` directamente con `event_bus.publish`, igual que
`test_realtime_sync.py` ya hace con `OfertaAccepted`/`LoteOpened`/etc. -- lo que este
archivo verifica es exclusivamente la capa que cambió (`EventDispatcher`), no la lógica
de negocio de moderación que la produce.
"""

import uuid
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest_asyncio
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.events.redis_bus import RedisEventBus
from app.moderation.events import ModerationInvalidBidThresholdExceeded
from app.modules.ofertas.events import OfertaAccepted
from app.modules.remates.events import RemateStarted
from app.modules.remates.lotes.events import LoteRequeued
from app.modules.users.models import User, UserRole
from app.redis.pubsub import RedisPubSub
from tests._role_test_helpers import activate_pending_account_sync

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


@pytest_asyncio.fixture
async def event_bus() -> AsyncIterator[RedisEventBus]:
    """`RedisEventBus` real, sobre un cliente Redis propio del loop del test -- ver
    docstring del módulo y de `test_realtime_sync.py::event_bus`."""
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield RedisEventBus(RedisPubSub(redis))
    finally:
        await redis.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(
    client: TestClient, *, email: str, role: str = "comprador"
) -> tuple[str, str]:
    register = client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Realtime Masking",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert register.status_code == 201, register.text
    if role in ("empresa", "rematador"):
        activate_pending_account_sync(email)
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _create_admin_and_login(
    client: TestClient, db_session: AsyncSession, *, email: str
) -> str:
    """Los admins no se crean por la API pública (ADR-010); se insertan directamente,
    igual que `app/scripts/create_superuser.py` en producción y que
    `test_roles.py::_create_admin_directly`."""
    db_session.add(
        User(
            email=email,
            hashed_password=hash_password("adminpass123"),
            full_name="Admin Realtime Masking",
            role=UserRole.ADMIN,
        )
    )
    await db_session.commit()
    login = client.post(LOGIN_URL, data={"username": email, "password": "adminpass123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _create_remate(client: TestClient, token: str) -> str:
    r = client.post(
        REMATES_URL,
        json={
            "title": "Remate de verificación de enmascarado realtime",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    remate_id = r.json()["id"]
    # Fase 2 de remediación del WebSocket Security Audit (posterior a este archivo, que
    # es de la Fase 1): `join_room` ahora exige autorización de dominio antes de la
    # membresía -- un remate recién creado queda en DRAFT (solo visible para su dueño),
    # así que hace falta programarlo para que los compradores/bystanders de estos tests
    # de enmascarado (que no son el dueño) también puedan unirse a la sala. No afecta lo
    # que estos tests verifican (privilegio de campo dentro de un evento ya entregado),
    # solo la precondición de que la sala se pueda joinear en primer lugar.
    schedule = client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert schedule.status_code == 200, schedule.text
    return remate_id


# Mismo helper, palabra por palabra, que `test_realtime_sync.py` -- ver el comentario
# de ese archivo para el porqué (un `join_room`/evento de dominio real siempre dispara,
# además, un evento de presencia/chat de sistema de forma asíncrona, sin garantía de
# orden relativo a lo que estos tests sí quieren observar).
_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_non_presence_message(websocket) -> dict:
    while True:
        message = websocket.receive_json()
        is_side_channel_event = message.get("type") == "domain_event" and str(
            message.get("event_type", "")
        ).startswith(_SIDE_CHANNEL_EVENT_PREFIXES)
        if not is_side_channel_event:
            return message


def _connect_join(ws_client: TestClient, token: str, remate_id: str):
    websocket = ws_client.websocket_connect(WS_URL).__enter__()
    websocket.send_json({"type": "auth", "token": token})
    websocket.receive_json()  # connected
    websocket.send_json({"type": "join_room", "remate_id": remate_id})
    _receive_non_presence_message(websocket)  # room_joined
    # El remate recién creado sigue en DRAFT: para un comprador (no dueño, no admin) el
    # snapshot da `NotFoundError` -> llega un `error`, no un `snapshot` -- cualquiera de
    # los dos se drena igual acá, ninguno es lo que estos tests quieren observar (mismo
    # criterio que `test_realtime_sync.py::_connect_join`).
    _receive_non_presence_message(websocket)
    return websocket


# --- oferta.accepted / oferta.* -- buyer_id -----------------------------------------


async def test_bystander_buyer_does_not_receive_real_buyer_id_of_oferta_accepted(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner1@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)

    _, bystander_token = _register_and_login(ws_client, email="mask-bystander1@example.com")
    bystander_ws = _connect_join(ws_client, bystander_token, remate_id)
    try:
        real_buyer_id = uuid.uuid4()
        await event_bus.publish(
            OfertaAccepted(
                remate_id=uuid.UUID(remate_id),
                oferta_id=uuid.uuid4(),
                lote_id=uuid.uuid4(),
                buyer_id=real_buyer_id,
                amount=Decimal("1500.00"),
            )
        )
        message = _receive_non_presence_message(bystander_ws)
        assert message["event_type"] == "oferta.accepted"
        assert message["payload"]["buyer_id"] is None
        # El resto de la información de negocio sigue llegando sin tocar -- la UI del
        # remate (monto, lote, resultado) tiene que seguir funcionando para el
        # comprador, solo la identidad de OTRO comprador se oculta.
        assert message["payload"]["amount"] == "1500.00"
        assert message["payload"]["lote_id"] is not None
    finally:
        bystander_ws.__exit__(None, None, None)


async def test_buyer_still_sees_their_own_buyer_id_in_oferta_accepted(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    """No es parte del pedido original del audit, pero es necesario para no romper la
    UI del comprador ("tu oferta fue aceptada"): un comprador siempre puede saber que
    UNA oferta puntual es la suya -- lo que no puede es conocer la identidad de otro."""
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner2@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)

    buyer_id, buyer_token = _register_and_login(ws_client, email="mask-buyer2@example.com")
    buyer_ws = _connect_join(ws_client, buyer_token, remate_id)
    try:
        await event_bus.publish(
            OfertaAccepted(
                remate_id=uuid.UUID(remate_id),
                oferta_id=uuid.uuid4(),
                lote_id=uuid.uuid4(),
                buyer_id=uuid.UUID(buyer_id),
                amount=Decimal("1500.00"),
            )
        )
        message = _receive_non_presence_message(buyer_ws)
        assert message["payload"]["buyer_id"] == buyer_id
    finally:
        buyer_ws.__exit__(None, None, None)


async def test_owner_rematador_still_receives_real_buyer_id_of_oferta_accepted(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner3@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)
    owner_ws = _connect_join(ws_client, owner_token, remate_id)
    try:
        real_buyer_id = uuid.uuid4()
        await event_bus.publish(
            OfertaAccepted(
                remate_id=uuid.UUID(remate_id),
                oferta_id=uuid.uuid4(),
                lote_id=uuid.uuid4(),
                buyer_id=real_buyer_id,
                amount=Decimal("1500.00"),
            )
        )
        message = _receive_non_presence_message(owner_ws)
        assert message["payload"]["buyer_id"] == str(real_buyer_id)
    finally:
        owner_ws.__exit__(None, None, None)


async def test_admin_still_receives_real_buyer_id_of_oferta_accepted(
    ws_client: TestClient, event_bus: RedisEventBus, db_session: AsyncSession
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner4@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)
    admin_token = await _create_admin_and_login(
        ws_client, db_session, email="mask-admin4@example.com"
    )

    admin_ws = _connect_join(ws_client, admin_token, remate_id)
    try:
        real_buyer_id = uuid.uuid4()
        await event_bus.publish(
            OfertaAccepted(
                remate_id=uuid.UUID(remate_id),
                oferta_id=uuid.uuid4(),
                lote_id=uuid.uuid4(),
                buyer_id=real_buyer_id,
                amount=Decimal("1500.00"),
            )
        )
        message = _receive_non_presence_message(admin_ws)
        assert message["payload"]["buyer_id"] == str(real_buyer_id)
    finally:
        admin_ws.__exit__(None, None, None)


# --- lote.requeued -- reserve_price --------------------------------------------------


async def test_bystander_buyer_does_not_receive_real_reserve_price_of_lote_requeued(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner5@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)

    _, bystander_token = _register_and_login(ws_client, email="mask-bystander5@example.com")
    bystander_ws = _connect_join(ws_client, bystander_token, remate_id)
    try:
        await event_bus.publish(
            LoteRequeued(
                remate_id=uuid.UUID(remate_id),
                lote_id=uuid.uuid4(),
                lot_number="1",
                display_order=1,
                round_number=2,
                base_price=Decimal("1000.00"),
                min_increment=Decimal("100.00"),
                reserve_price=Decimal("5000.00"),
            )
        )
        message = _receive_non_presence_message(bystander_ws)
        assert message["event_type"] == "lote.requeued"
        assert message["payload"]["reserve_price"] is None
        # El resto de las condiciones comerciales del lote sigue siendo pública.
        assert message["payload"]["base_price"] == "1000.00"
        assert message["payload"]["min_increment"] == "100.00"
    finally:
        bystander_ws.__exit__(None, None, None)


async def test_owner_rematador_still_receives_real_reserve_price_of_lote_requeued(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner6@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)
    owner_ws = _connect_join(ws_client, owner_token, remate_id)
    try:
        await event_bus.publish(
            LoteRequeued(
                remate_id=uuid.UUID(remate_id),
                lote_id=uuid.uuid4(),
                lot_number="1",
                display_order=1,
                round_number=2,
                base_price=Decimal("1000.00"),
                min_increment=Decimal("100.00"),
                reserve_price=Decimal("5000.00"),
            )
        )
        message = _receive_non_presence_message(owner_ws)
        assert message["payload"]["reserve_price"] == "5000.00"
    finally:
        owner_ws.__exit__(None, None, None)


# --- moderacion.umbral_ofertas_invalidas_superado -- privilegiado-only ---------------


async def test_common_buyer_never_receives_moderation_invalid_bid_threshold_event(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner7@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)

    _, buyer_token = _register_and_login(ws_client, email="mask-buyer7@example.com")
    buyer_ws = _connect_join(ws_client, buyer_token, remate_id)
    try:
        await event_bus.publish(
            ModerationInvalidBidThresholdExceeded(
                remate_id=uuid.UUID(remate_id),
                buyer_id=uuid.uuid4(),
                attempt_count=5,
                threshold=5,
            )
        )
        # No debe llegar nada por este evento -- se confirma con la misma técnica que
        # `test_realtime_sync.py::test_unregistered_event_type_is_not_forwarded`:
        # provocar una respuesta propia y verificar que es lo primero que llega (si el
        # evento se hubiera entregado, sería la próxima entrada en la cola y el
        # `assert` de abajo fallaría).
        buyer_ws.send_json({"type": "leave_room"})
        response = _receive_non_presence_message(buyer_ws)
        assert response == {"schema_version": 1, "type": "room_left", "remate_id": remate_id}
    finally:
        buyer_ws.__exit__(None, None, None)


async def test_another_rematador_who_is_not_the_owner_never_receives_the_event_either(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    """"Otro rematador" (no dueño de ESTE remate) se trata exactamente igual que un
    comprador -- misma regla de privilegio (`is_privileged_viewer`: dueño o admin, el
    rol `rematador` por sí solo no alcanza), sin necesidad de ningún caso especial."""
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner8@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)

    _, other_rematador_token = _register_and_login(
        ws_client, email="mask-other-rematador8@example.com", role="empresa"
    )
    other_ws = _connect_join(ws_client, other_rematador_token, remate_id)
    try:
        await event_bus.publish(
            ModerationInvalidBidThresholdExceeded(
                remate_id=uuid.UUID(remate_id),
                buyer_id=uuid.uuid4(),
                attempt_count=5,
                threshold=5,
            )
        )
        other_ws.send_json({"type": "leave_room"})
        response = _receive_non_presence_message(other_ws)
        assert response == {"schema_version": 1, "type": "room_left", "remate_id": remate_id}
    finally:
        other_ws.__exit__(None, None, None)


async def test_owner_rematador_receives_moderation_invalid_bid_threshold_event(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner9@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)
    owner_ws = _connect_join(ws_client, owner_token, remate_id)
    try:
        await event_bus.publish(
            ModerationInvalidBidThresholdExceeded(
                remate_id=uuid.UUID(remate_id),
                buyer_id=uuid.uuid4(),
                attempt_count=5,
                threshold=5,
            )
        )
        message = _receive_non_presence_message(owner_ws)
        assert message["event_type"] == "moderacion.umbral_ofertas_invalidas_superado"
        assert message["payload"]["attempt_count"] == 5
        assert message["payload"]["threshold"] == 5
    finally:
        owner_ws.__exit__(None, None, None)


# --- Regresión: eventos públicos siguen llegando a todos, sin tocar --------------------


async def test_public_event_still_reaches_every_room_member_unmasked(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    """No se soluciona seguridad rompiendo el realtime: un evento sin ningún campo
    protegido (`remate.started`, aquí como representante del resto de `SYNCED_EVENTS`)
    tiene que seguir llegando exactamente igual, a TODOS los miembros de la sala, dueño
    o no."""
    _, owner_token = _register_and_login(
        ws_client, email="mask-owner10@example.com", role="empresa"
    )
    remate_id = _create_remate(ws_client, owner_token)
    _, buyer_token = _register_and_login(ws_client, email="mask-buyer10@example.com")

    owner_ws = _connect_join(ws_client, owner_token, remate_id)
    buyer_ws = _connect_join(ws_client, buyer_token, remate_id)
    try:
        await event_bus.publish(RemateStarted(remate_id=uuid.UUID(remate_id)))
        for websocket in (owner_ws, buyer_ws):
            message = _receive_non_presence_message(websocket)
            assert message["event_type"] == "remate.started"
            assert message["remate_id"] == remate_id
    finally:
        owner_ws.__exit__(None, None, None)
        buyer_ws.__exit__(None, None, None)
