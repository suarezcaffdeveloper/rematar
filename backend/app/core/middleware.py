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
"""

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

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

        return response
