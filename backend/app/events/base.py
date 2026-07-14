"""Base de todo evento de dominio (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md y docs/adr/ADR-022-arquitectura-de-eventos.md.

Transversal, sin conocimiento de dominio — igual que `app/db/mixins.py` provee mixins
que `Remate`/`Lote`/`Oferta` usan sin que `db/` sepa qué es un remate, acá se provee la
forma común de todo evento (`event_id`, `occurred_at`, `event_type`, `topic`) para que
cada módulo de dominio (`app/modules/remates/events.py`, `.../lotes/events.py`,
`app/modules/ofertas/events.py`) defina sus propias clases concretas sobre esta base.

Son objetos Pydantic, no `dict` ni strings sueltos: cada evento concreto tiene sus
propios campos tipados y un `event_type` fijo (`Literal[...]`), el mismo patrón de
"discriminated union" que un futuro consumidor va a usar para despachar por tipo sin
ambigüedad.
"""

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field


class DomainEvent(BaseModel):
    """Todo evento de dominio del sistema hereda de acá (indirectamente, vía
    `RemateScopedEvent`). `event_type` no tiene default acá a propósito: cada subclase
    concreta lo fija con un `Literal["..."]`, nunca queda como un `str` libre."""

    event_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    event_type: str

    @property
    def topic(self) -> str:
        """Canal de Redis Pub/Sub en el que se publica este evento (ver
        `app/events/redis_bus.py`). Sin implementación acá: `RemateScopedEvent` (y
        cualquier futura base de scoping distinta) la provee."""
        raise NotImplementedError


class RemateScopedEvent(DomainEvent):
    """Todo evento de este sistema está scoped a un `Remate` — `Lote` y `Oferta` son
    sub-entidades de su ciclo de vida, así que sus eventos comparten el mismo canal que
    los del propio Remate. Esto es lo que le permite a un futuro consumidor de
    WebSocket suscribirse una sola vez por remate y recibir todos sus eventos
    relacionados, sin importar de qué entidad provienen — ver ADR-022, sección C."""

    remate_id: uuid.UUID

    @property
    def topic(self) -> str:
        return f"events.{self.remate_id}"
