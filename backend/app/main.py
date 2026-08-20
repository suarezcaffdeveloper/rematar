"""Punto de entrada de la aplicación FastAPI.

`create_app()` es una factory, no una instancia de módulo creada implícitamente al
importar — esto es lo que permite a los tests (`tests/conftest.py`) construir una app
nueva con configuración de test sin depender de efectos secundarios de import. `app`
(la instancia real que usa Uvicorn) se crea una única vez al final de este archivo.

El `lifespan` es el único lugar que conoce el ciclo de vida completo del proceso: acá
se crea el cliente Redis compartido (Módulo 3.1) y el `ConnectionManager` del Gateway
WebSocket (Módulo 3.3) al arrancar, y ambos se cierran prolijamente al apagar — ver
docs/18-integracion-redis.md, docs/20-gateway-websocket.md. El `RoomManager` (Módulo
3.4, docs/21-sistema-de-salas.md) también se crea acá, pero no necesita cierre
explícito: no retiene sockets ni ninguna otra conexión externa, solo los `UUID` de las
salas activas. El `EventConsumer` (Módulo 3.5, docs/22-sincronizacion-tiempo-real.md)
arranca acá como tarea de fondo después de que los tres managers de arriba existen (los
necesita para poder repartir eventos) y se detiene primero en el shutdown, antes de
cerrar `ConnectionManager`/Redis — para dejar de intentar mandar mensajes a sockets que
están a punto de cerrarse.

Un **segundo** `EventConsumer` (Épica 6, Módulo 6.4, ver docs/34-chat-del-remate.md y
ADR-037) arranca en paralelo, con un dispatcher distinto
(`ChatSystemEventDispatcher`): genera los mensajes de sistema del chat (inicio/pausa/
reanudación de un remate, apertura/cierre de un lote) reaccionando a los mismos eventos
de dominio que el primer consumidor ya reenvía a los clientes WS -- dos suscriptores
independientes sobre el mismo patrón `events.*`, exactamente el uso normal de Redis
Pub/Sub (múltiples suscriptores). Se arranca/detiene junto con el primero.

Su `session_factory` se resuelve como `app.state.db_session_factory` si ya existe,
`AsyncSessionLocal` (`app/db/session.py`) si no -- mismo criterio que `get_db` (que los
tests ya sobreescriben vía `app.dependency_overrides`, ver `tests/conftest.py`): un
consumidor de fondo no pasa por la inyección de dependencias de FastAPI, así que no
puede reusar ese mecanismo, pero sí puede leer un `app.state` fijado por el test *antes*
de entrar al `lifespan` -- evita que este consumidor, en tests, termine usando el
`engine` de producción (atado a un event loop que pytest-asyncio cierra al terminar
cada test, ver el docstring de `tests/conftest.py::ws_client` para el mismo problema ya
resuelto ahí para `get_db`).

Un **`TimerExpiryScheduler`** (Épica 8, "cuenta regresiva y cierre automático", ver
docs/40-cuenta-regresiva-y-cierre-automatico.md y ADR-043) arranca junto a los dos
consumidores de arriba, mismo criterio de `session_factory` -- a diferencia de esos dos,
no es un `EventConsumer` (no reacciona a un evento ya publicado): es una tarea que
sondea periódicamente qué lotes tienen el timer vencido y los cierra automáticamente.

Un **tercer** `EventConsumer` (Épica 7, Módulo 7.5, ver docs/41-gestion-post-remate.md y
ADR-044) arranca junto a los anteriores, con `PostAuctionEventDispatcher`: reacciona a
`lote.winner_determined` para crear automáticamente el caso post-remate de un lote recién
adjudicado -- mismo patrón exacto que `ChatSystemEventDispatcher` (un tercer suscriptor
independiente sobre el mismo canal `events.*`), y por eso `app/modules/remates/lotes/`
no necesita ningún cambio para que este módulo exista. Este dispatcher recibe además un
`NotificationService` (`app/notify/`, construido acá con `build_notification_service` --
mismo criterio que `RedisEventBus`, un consumidor de fondo no pasa por `Depends()`): al
crear el caso post-remate, dispara el email de "ganaste el lote" al comprador sin
bloquear nada -- ver el docstring de `PostAuctionService.create_case_from_winner`.

Un **cuarto** `EventConsumer` (Épica 7, Módulo 7.6, ver
docs/42-moderacion-en-tiempo-real.md y ADR-045) arranca junto a los anteriores, con
`ModerationEventDispatcher`: reacciona a `oferta.rejected` para detectar intentos
reiterados de ofertas inválidas -- mismo patrón, y por eso `app/modules/ofertas/` no
necesita ningún cambio para que el Moderation Service exista.

Un **quinto** `EventConsumer` (módulo de Bots Simuladores) arranca junto a los
anteriores, con `BotEventDispatcher` (`app/modules/bots/dispatcher.py`): reacciona a
`lote.opened`/`lote.closed`/`remate.paused`/`remate.resumed`/`oferta.accepted`/
`remate.finished`/`remate.cancelled` para programar (o cancelar) las reacciones de los
bots en curso -- mismo patrón exacto, así que ni `app/modules/remates/` ni
`app/modules/ofertas/` necesitan ningún cambio para que este módulo exista. También se
crea acá `app.state.bot_runner_registry` (`BotRunnerRegistry`, análogo a `RoomManager`:
puramente in-process, ver su docstring) y, **antes** de levantar este consumidor, se
reconcilian las filas de `bot_simulation_runs` que hayan quedado `running`/`paused` de
una instancia anterior del proceso -- sin tareas `asyncio` reales detrás tras un
reinicio, se marcan `stopped` para que la UI nunca muestre una simulación fantasma.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.session import AsyncSessionLocal
from app.events.redis_bus import RedisEventBus
from app.moderation.realtime import ModerationEventDispatcher
from app.modules.auth.events import SESSION_INVALIDATED_TOPIC
from app.modules.auth.realtime import SessionInvalidationDispatcher
from app.modules.bots.dispatcher import BotEventDispatcher
from app.modules.bots.repository import BotSimulationRunRepository
from app.modules.bots.runner import BotRunnerRegistry
from app.modules.chat.realtime import ChatSystemEventDispatcher
from app.notify.dependencies import build_notification_service
from app.postauction.realtime import PostAuctionEventDispatcher
from app.realtime.consumer import EventConsumer
from app.realtime.dispatcher import EventDispatcher
from app.redis.client import build_redis_client
from app.redis.pubsub import RedisPubSub
from app.redis.rate_limit import RedisRateLimiter
from app.timer.scheduler import TimerExpiryScheduler
from app.websocket.close_codes import SERVER_SHUTTING_DOWN
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager
from app.whatsapp.redirect_router import router as whatsapp_redirect_router

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Cuatro logs de ciclo de vida del proceso completo (Épica 8, Módulo 8.1,
    "Registrar: Inicio y cierre de servicios") -- hasta acá solo existían logs por
    componente individual (`event_consumer_stopped`, etc.), ninguno marcaba el
    arranque/apagado del proceso en sí."""
    settings = get_settings()
    logger.info("app_starting", environment=settings.ENVIRONMENT)
    app.state.redis = build_redis_client(settings)
    app.state.connection_manager = ConnectionManager()
    app.state.room_manager = RoomManager()

    # `session_factory`: Fase 1 de remediación del WebSocket Security Audit (ver
    # app/realtime/privilege.py) -- EventDispatcher necesita resolver dueño/rol para
    # enmascarar buyer_id/reserve_price por destinatario en los eventos protegidos.
    # Mismo criterio que chat_session_factory/timer_session_factory/etc. dos líneas más
    # abajo: reusa `app.state.db_session_factory` si el test ya lo fijó, si no
    # `AsyncSessionLocal`.
    dispatcher_session_factory = getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    dispatcher = EventDispatcher(
        app.state.connection_manager, app.state.room_manager, dispatcher_session_factory
    )
    app.state.event_consumer = EventConsumer(
        app.state.redis,
        dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.event_consumer.start()

    chat_session_factory = getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    chat_system_dispatcher = ChatSystemEventDispatcher(
        chat_session_factory,
        RedisEventBus(RedisPubSub(app.state.redis)),
        RedisRateLimiter(app.state.redis),
        settings,
    )
    app.state.chat_system_event_consumer = EventConsumer(
        app.state.redis,
        chat_system_dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.chat_system_event_consumer.start()

    timer_session_factory = getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    app.state.timer_expiry_scheduler = TimerExpiryScheduler(
        timer_session_factory,
        RedisEventBus(RedisPubSub(app.state.redis)),
        settings,
    )
    app.state.timer_expiry_scheduler.start()

    postauction_session_factory = (
        getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    )
    postauction_dispatcher = PostAuctionEventDispatcher(
        postauction_session_factory,
        RedisEventBus(RedisPubSub(app.state.redis)),
        build_notification_service(settings),
    )
    app.state.postauction_event_consumer = EventConsumer(
        app.state.redis,
        postauction_dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.postauction_event_consumer.start()

    moderation_session_factory = (
        getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    )
    moderation_dispatcher = ModerationEventDispatcher(
        moderation_session_factory,
        RedisEventBus(RedisPubSub(app.state.redis)),
        app.state.connection_manager,
        app.state.room_manager,
        app.state.redis,
        settings,
    )
    app.state.moderation_event_consumer = EventConsumer(
        app.state.redis,
        moderation_dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.moderation_event_consumer.start()

    # Fase 3 de remediación del WebSocket Security Audit -- ver
    # app/modules/auth/realtime.py y app/modules/auth/events.py. Sin `session_factory`
    # (a diferencia de los consumidores de arriba): `SessionInvalidationDispatcher` no
    # toca la base, solo `app.state.connection_manager` (en memoria). Suscripto a un
    # canal propio (`SESSION_INVALIDATED_TOPIC`, no al patrón `events.*` de arriba,
    # que es para eventos scoped a un remate -- este no lo está).
    session_invalidation_dispatcher = SessionInvalidationDispatcher(app.state.connection_manager)
    app.state.session_invalidation_consumer = EventConsumer(
        app.state.redis,
        session_invalidation_dispatcher,
        pattern=SESSION_INVALIDATED_TOPIC,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.session_invalidation_consumer.start()

    bots_session_factory = getattr(app.state, "db_session_factory", None) or AsyncSessionLocal
    async with bots_session_factory() as reconciliation_db:
        reconciled = await BotSimulationRunRepository(reconciliation_db).reconcile_orphaned_runs()
        if reconciled:
            logger.warning("bot_simulation_runs_reconciled_on_startup", count=reconciled)
    app.state.bot_runner_registry = BotRunnerRegistry(
        bots_session_factory,
        RedisEventBus(RedisPubSub(app.state.redis)),
        RedisRateLimiter(app.state.redis),
        settings,
    )
    bot_dispatcher = BotEventDispatcher(bots_session_factory, app.state.bot_runner_registry)
    app.state.bot_event_consumer = EventConsumer(
        app.state.redis,
        bot_dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.bot_event_consumer.start()
    logger.info("app_started")
    try:
        yield
    finally:
        logger.info("app_shutting_down")
        await app.state.bot_event_consumer.stop()
        await app.state.bot_runner_registry.shutdown()
        await app.state.session_invalidation_consumer.stop()
        await app.state.moderation_event_consumer.stop()
        await app.state.postauction_event_consumer.stop()
        await app.state.timer_expiry_scheduler.stop()
        await app.state.chat_system_event_consumer.stop()
        await app.state.event_consumer.stop()
        await app.state.connection_manager.close_all(
            code=SERVER_SHUTTING_DOWN, reason="El servidor se está apagando."
        )
        await app.state.redis.aclose()
        logger.info("app_stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="Plataforma de remates en vivo.",
        version="0.1.0",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url=f"{settings.API_V1_PREFIX}/docs",
        redoc_url=f"{settings.API_V1_PREFIX}/redoc",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    app.include_router(whatsapp_redirect_router)

    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.MEDIA_URL_PREFIX,
        StaticFiles(directory=media_root),
        name="media",
    )

    register_system_routes(app)

    return app

def register_system_routes(app: FastAPI) -> None:
    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "service": "RematAR API",
            "status": "ok",
        }

    @app.get("/health", include_in_schema=False)
    async def health():
        return {
            "status": "ok",
        }


app = create_app()


