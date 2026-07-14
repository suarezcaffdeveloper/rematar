"""Event Bus interno (Épica 3, Módulo 3.2). Ver docs/19-arquitectura-de-eventos.md y
ADR-022, sección A.

`EventBus` es un `Protocol` (PEP 544, tipado estructural), no una clase con herencia
obligatoria: el dominio (`RemateService`, `LoteService`, `AuctionEngine`) declara su
dependencia como `event_bus: EventBus` sin importar nada de Redis ni de ninguna
implementación concreta — no conoce quién consume los eventos ni cómo se transportan.

**Contrato**: `publish` nunca lanza. Cualquier implementación es responsable de atrapar
sus propios errores (ver `RedisEventBus` en `app/events/redis_bus.py`) — publicar un
evento es de mejor esfuerzo, nunca puede hacer fallar una operación de negocio que ya se
confirmó en la base de datos (ADR-022, sección D).
"""

from typing import Protocol

from app.events.base import DomainEvent


class EventBus(Protocol):
    async def publish(self, event: DomainEvent) -> None: ...
