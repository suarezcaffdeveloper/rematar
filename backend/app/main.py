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
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.realtime.consumer import EventConsumer
from app.realtime.dispatcher import EventDispatcher
from app.redis.client import build_redis_client
from app.websocket.close_codes import SERVER_SHUTTING_DOWN
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.redis = build_redis_client(settings)
    app.state.connection_manager = ConnectionManager()
    app.state.room_manager = RoomManager()

    dispatcher = EventDispatcher(app.state.connection_manager, app.state.room_manager)
    app.state.event_consumer = EventConsumer(
        app.state.redis,
        dispatcher,
        retry_base_seconds=settings.REALTIME_CONSUMER_RETRY_BASE_SECONDS,
        retry_max_seconds=settings.REALTIME_CONSUMER_RETRY_MAX_SECONDS,
    )
    app.state.event_consumer.start()
    try:
        yield
    finally:
        await app.state.event_consumer.stop()
        await app.state.connection_manager.close_all(
            code=SERVER_SHUTTING_DOWN, reason="El servidor se está apagando."
        )
        await app.state.redis.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title=settings.PROJECT_NAME,
        description=(
            "Plataforma de remates en vivo. Ver /docs para la documentación interactiva."
        ),
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

    @app.get("/health", tags=["health"], summary="Liveness/readiness probe")
    async def health(request: Request) -> dict[str, object]:
        # Nunca devuelve un status HTTP de error por Redis caído (soft-fail
        # deliberado, ver ADR-021 sección C): Redis es soporte, nunca fuente de
        # verdad (ADR-002), y hoy ningún endpoint depende de él para funcionar.
        try:
            redis_ok = bool(await request.app.state.redis.ping())
        except Exception:  # noqa: BLE001 — cualquier falla de Redis es "no disponible"
            redis_ok = False
        return {"status": "ok", "checks": {"redis": "ok" if redis_ok else "unavailable"}}

    return app


app = create_app()
