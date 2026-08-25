"""Jerarquía de excepciones de dominio y su traducción a respuestas HTTP.

Por qué una jerarquía propia en vez de levantar `HTTPException` de FastAPI directamente
desde los servicios: los servicios (capa de negocio) no deberían conocer el concepto de
"HTTP" — `UserService.register()` no sabe ni le importa que lo esté llamando un router
HTTP; podría llamarlo un test, un script de bootstrap (`app/scripts/create_superuser.py`)
o, en el futuro, un consumidor de eventos. Levantar `HTTPException(status_code=409, ...)`
desde ahí acoplaría la capa de negocio al transporte. En cambio, la capa de negocio levanta
`ConflictError("email ya registrado")`, y esta capa central decide, una única vez, que
`ConflictError` se traduce a un 409.

Todas las respuestas de error siguen el mismo sobre (`envelope`) documentado en
`app/common/schemas.py`: `{"error": {"code": ..., "message": ..., "details": ...}}`, para
que el frontend (y cualquier cliente) parseen errores de una única forma consistente.
"""

from __future__ import annotations

import time
import uuid
from decimal import Decimal

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.redis.metrics import RedisMetricsRecorder

logger = structlog.get_logger(__name__)


async def _record_error_metric(request: Request) -> None:
    """Contador de errores no manejados (Épica 8, Módulo 8.1) -- alimenta
    `errors_last_minute` en `GET /monitoring/metrics`, un indicador de "eventos
    críticos" recientes. Best-effort: una falla acá nunca debe impedir devolver la
    respuesta de error ya construida (que es lo único que realmente importa acá)."""
    try:
        redis_client = request.app.state.redis
    except AttributeError:
        return
    try:
        await RedisMetricsRecorder(redis_client).record_event("errors_total", now=time.time())
    except Exception:  # noqa: BLE001
        logger.warning("error_metric_record_failed")


class AppError(Exception):
    """Excepción base de todos los errores de negocio esperables de la aplicación."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "internal_error"

    def __init__(self, message: str, **details: object) -> None:
        self.message = message
        self.details = details or None
        super().__init__(message)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "conflict"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "unauthorized"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "forbidden"


class BusinessRuleError(AppError):
    """Una regla de negocio explícita fue violada (más allá de simple validación de tipos)."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "business_rule_violation"


class RateLimitError(AppError):
    """El llamador superó un límite de frecuencia explícito (Épica 6, Módulo 6.4,
    `RedisRateLimiter`) -- distinto de `BusinessRuleError`: no es una regla de negocio
    violada, es un límite de uso, con el código HTTP estándar para eso (429)."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "rate_limited"


def _error_envelope(code: str, message: str, details: object | None = None) -> dict:
    body: dict[str, object] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def _serialize_validation_errors(errors: list[dict]) -> list[dict]:
    """Sanea `RequestValidationError.errors()` para que sea JSON-serializable.

    Pydantic v2 incluye, en `ctx`, valores no serializables por `json.dumps` sin ayuda:
    la excepción original que levantó un `field_validator` (por ejemplo, el `ValueError`
    de `UserCreate.role_must_be_publicly_registerable` en `app/modules/users/schemas.py`)
    — se descubrió probando el registro con `role=admin` en Fase 1 — y, desde que
    `Lote.base_price`/`min_increment`/`reserve_price` (Módulo 2.2) son los primeros campos
    `Decimal` del proyecto con restricciones numéricas (`gt=0`), también el límite
    (`Decimal("0")`) que Pydantic adjunta a `ctx` cuando esa restricción falla — se
    descubrió probando `base_price=0`. Acá se convierte cualquier valor no nativo de JSON
    dentro de `ctx` a texto antes de devolver la respuesta.
    """
    sanitized = []
    for error in errors:
        error = dict(error)
        ctx = error.get("ctx")
        if isinstance(ctx, dict):
            error["ctx"] = {
                key: str(value) if isinstance(value, Exception | Decimal) else value
                for key, value in ctx.items()
            }
        sanitized.append(error)
    return sanitized


def _cors_headers_for_unhandled_error(request: Request) -> dict[str, str]:
    """Replica a mano el `Access-Control-Allow-*` que `CORSMiddleware` (`app/main.py`)
    le agregaría a cualquier otra respuesta -- necesario ACÁ porque una excepción sin
    manejar nunca pasa por ese middleware.

    Detalle no obvio de Starlette: un handler registrado para la clase `Exception` (el
    de más abajo, `handle_unexpected_error`) no lo usa `ExceptionMiddleware` como al
    resto de los handlers de esta función -- Starlette lo saca aparte y se lo pasa a
    `ServerErrorMiddleware`, que es el middleware MÁS externo de toda la pila (envuelve
    a `CORSMiddleware`, no al revés). Una respuesta armada ahí sale directo al cliente
    sin pasar nunca por `CORSMiddleware`, así que le falta el encabezado
    `Access-Control-Allow-Origin` -- el navegador, al no encontrarlo, reporta la
    request entera como "bloqueada por CORS" en vez de mostrar el 500 real. Esto pasa
    con CUALQUIER excepción no controlada (un bug real, no solo un caso de negocio
    esperable) -- se descubrió con un `PermissionError` al escribir una imagen de lote
    contra un volumen de Railway recién montado (dueño root, proceso corriendo como
    usuario sin privilegios), pero aplica a cualquier otra igual.
    """
    origin = request.headers.get("origin")
    if origin and origin in get_settings().CORS_ORIGINS:
        return {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true"}
    return {}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.info(
            "request_failed",
            error_code=exc.error_code,
            message=exc.message,
            path=request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_envelope(exc.error_code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_envelope(
                "validation_error",
                "Los datos enviados no son válidos.",
                _serialize_validation_errors(exc.errors()),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_envelope("http_error", str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        incident_id = str(uuid.uuid4())
        logger.exception("unhandled_exception", incident_id=incident_id, path=request.url.path)
        await _record_error_metric(request)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_envelope(
                "internal_error",
                "Ocurrió un error inesperado. Fue registrado para su revisión.",
                {"incident_id": incident_id},
            ),
            headers=_cors_headers_for_unhandled_error(request),
        )
