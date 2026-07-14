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

import uuid

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger(__name__)


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


def _error_envelope(code: str, message: str, details: object | None = None) -> dict:
    body: dict[str, object] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def _serialize_validation_errors(errors: list[dict]) -> list[dict]:
    """Sanea `RequestValidationError.errors()` para que sea JSON-serializable.

    Pydantic v2 incluye, en `ctx`, la excepción original que levantó un `field_validator`
    (por ejemplo, el `ValueError` de `UserCreate.role_must_be_publicly_registerable` en
    `app/modules/users/schemas.py`) como objeto Python, no como texto. `json.dumps` no
    sabe serializar un `ValueError` y rompe con un 500 en vez de devolver el 422 esperado
    — se descubrió probando el registro con `role=admin` en esta misma fase. Acá se
    convierte cualquier excepción dentro de `ctx` a su mensaje de texto antes de
    devolver la respuesta.
    """
    sanitized = []
    for error in errors:
        error = dict(error)
        ctx = error.get("ctx")
        if isinstance(ctx, dict):
            error["ctx"] = {
                key: str(value) if isinstance(value, Exception) else value
                for key, value in ctx.items()
            }
        sanitized.append(error)
    return sanitized


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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_envelope(
                "internal_error",
                "Ocurrió un error inesperado. Fue registrado para su revisión.",
                {"incident_id": incident_id},
            ),
        )
