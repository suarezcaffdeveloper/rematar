"""Implementación del `EventBus` sobre Redis Pub/Sub (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md y ADR-022.

Reutiliza `RedisPubSub` (Módulo 3.1) sin cambios — este archivo es, literalmente, el
primer consumidor real de esa capa de infraestructura. ADR-009 ya había elegido Pub/Sub
como backplane de fan-out; acá se pone en práctica para publicar, aunque todavía no
exista ningún suscriptor.
"""

import structlog

from app.events.base import DomainEvent
from app.redis.pubsub import RedisPubSub

logger = structlog.get_logger(__name__)


class RedisEventBus:
    """`EventBus` respaldado por Redis Pub/Sub. Sin consumidores todavía (Épica 3.2):
    publicar acá no tiene ningún efecto observable más allá de "algún suscriptor
    futuro, si existe, lo recibe" — comportamiento esperado de Pub/Sub (R-04, aceptado
    desde Fase 0).

    `publish` nunca propaga una excepción (ver `EventBus`, contrato): cualquier falla de
    Redis se registra por log y se descarta, para que una acción de negocio que ya se
    confirmó en Postgres nunca dependa de que Redis esté disponible en ese instante
    (ADR-022, sección D — extensión directa de ADR-002).
    """

    def __init__(self, pubsub: RedisPubSub) -> None:
        self._pubsub = pubsub

    async def publish(self, event: DomainEvent) -> None:
        try:
            subscriber_count = await self._pubsub.publish(event.topic, event.model_dump_json())
        except Exception:
            logger.exception(
                "domain_event_publish_failed",
                event_type=event.event_type,
                event_id=str(event.event_id),
                topic=event.topic,
            )
            return

        logger.info(
            "domain_event_published",
            event_type=event.event_type,
            event_id=str(event.event_id),
            topic=event.topic,
            subscriber_count=subscriber_count,
        )
