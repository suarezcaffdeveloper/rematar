"""Middleware transversal de la aplicación.

Un único middleware (`RequestContextMiddleware`) se encarga de tres cosas relacionadas
que tiene sentido resolver juntas: generar un `request_id` por request, propagarlo como
contexto de logging (así todo log emitido durante ese request, sin importar en qué
módulo, incluye el mismo `request_id`) y devolverlo en el header `X-Request-ID` para que
el cliente pueda correlacionar un error con una entrada de log concreta — esto es lo que
en la práctica hace útil el `incident_id` que `core/exceptions.py` genera ante errores
no manejados.

Se implementa sobre `BaseHTTPMiddleware` de Starlette en vez de un middleware ASGI puro.
Es una simplificación consciente: `BaseHTTPMiddleware` tiene limitaciones conocidas con
respuestas en streaming, pero esta API no expone (todavía) ningún endpoint de streaming
— eso llegará recién con WebSockets en una fase futura, que de todos modos no pasa por
este middleware HTTP. Si en el futuro se agrega un endpoint de streaming HTTP (no WS),
esta decisión debe revisarse.

## Métrica de tiempo de respuesta (Épica 8, Módulo 8.1)

`duration_ms` ya se calculaba y logueaba desde la Fase 1; lo único nuevo es una llamada
additiva a `RedisMetricsRecorder.record_timing` (`app/redis/metrics.py`) que alimenta
`avg_api_response_ms` en `GET /monitoring/metrics` -- best-effort (nunca puede romper
un request: si Redis está caído, se loguea una advertencia y se sigue, mismo criterio
que `EventBus.publish`, ADR-022). El logging existente (`request_completed`) no cambió
un bit.
"""

import asyncio
import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.redis.metrics import RedisMetricsRecorder

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER, str(uuid.uuid4()))

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info("request_completed", status_code=response.status_code, duration_ms=duration_ms)
        # Fire-and-forget: con `BaseHTTPMiddleware`, la respuesta no se termina de
        # escribir en el socket hasta que `dispatch` retorna -- un `await` acá adentro
        # (aunque esté en un try/except) demora la respuesta real hasta que Redis
        # conteste, no solo hasta que la app decida seguir. Para un healthcheck externo
        # con timeout propio eso puede ser la diferencia entre 200 y "service
        # unavailable" aunque la app ya haya terminado de procesar el request.
        asyncio.create_task(self._record_metric(request, duration_ms))

        return response

    @staticmethod
    async def _record_metric(request: Request, duration_ms: float) -> None:
        try:
            redis_client = request.app.state.redis
        except AttributeError:
            return  # tests que no levantan el lifespan completo (sin app.state.redis)
        try:
            await RedisMetricsRecorder(redis_client).record_timing(
                "api_response", duration_ms, now=time.time()
            )
        except Exception:  # noqa: BLE001 -- best-effort, nunca debe romper un request
            logger.warning("api_response_metric_record_failed")
