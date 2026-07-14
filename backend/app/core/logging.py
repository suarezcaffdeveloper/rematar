"""Configuración de logging estructurado.

Se eligió `structlog` sobre configurar a mano el `logging` estándar por una razón
puntual de este proyecto: RNF-15 pide que toda oferta procesada y toda transición de
estado quede loggeada con contexto suficiente para reconstruir qué pasó ante una
disputa. Lograr eso con `logging.Logger.info("texto %s", var)` obliga a parsear texto
después; con `structlog` cada log es un evento con campos (`logger.info("oferta_aceptada",
lote_id=..., monto=...)`) que se serializan como JSON en producción, listos para un
agregador de logs.

Alternativa considerada: `logging` estándar + un `Formatter` JSON casero. Es viable y
más liviano (una dependencia menos), pero `structlog` ya resuelve el "bind" de contexto
por request (ver `app/core/middleware.py`, que asocia un `request_id` a todos los logs
emitidos durante ese request) sin tener que pasar ese campo a mano en cada llamada a
`logger.info(...)`. Ese `contextvars` binding es la razón concreta de la elección.

Los logs de acceso de Uvicorn (`uvicorn.access`) y cualquier log de librerías que usen
`logging` estándar se enrutan por el mismo formateador, para que todo el output del
proceso tenga un único formato consistente.
"""

import logging
import sys

import structlog

from app.core.config import Settings


def configure_logging(settings: Settings) -> None:
    """Configura structlog y el logging estándar. Se llama una sola vez al arrancar la app."""

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer()
        if settings.LOG_JSON
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=shared_processors + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.LOG_LEVEL)

    # Uvicorn instala sus propios handlers; los reemplazamos para que respeten el
    # mismo formato en vez de imprimir texto plano sin estructura.
    for uvicorn_logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(uvicorn_logger_name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
