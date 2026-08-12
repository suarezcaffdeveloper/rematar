"""DTOs del Snapshot Service (Épica 3, Módulo 3.6). Ver docs/23-snapshot-service.md.

`RemateStateSnapshot` reutiliza `RemateRead`/`LoteRead` (`app/modules/remates/`) tal
cual — son, literalmente, la misma forma que ya devuelve `GET /remates/{id}` y
`GET /remates/{id}/lotes/{id}`, así que un cliente no necesita dos parsers distintos
para el mismo dato. `OfertaSnapshotEntry` es nuevo (no reutiliza `OfertaRead`) porque
necesita `buyer_id` opcional para poder ocultar la identidad del ofertante a
compradores que no son dueños del remate ni administradores — mismo criterio de
privacidad que ya aplica `LeadingOfferRead` (`app/modules/ofertas/schemas.py`) a la
oferta líder; acá se generaliza también al historial reciente.

`is_bot` (módulo de Bots Simuladores) es el único lugar de todo el backend donde se
expone si un ofertante es un simulador -- ver el docstring de
`app/modules/bots/lookup.py::BotIdentityResolver` para por qué acá y en ningún otro
schema: es el único punto donde `buyer_id` se enmascara (`SnapshotService._mask_oferta`)
para un comprador anónimo, así que es el único lugar donde ese comprador no tendría
ninguna otra forma de saber que quien lidera es un simulador. Se resuelve **antes** de
`_mask_oferta` (nunca se enmascara: es información de "qué tipo de participante es",
no de identidad) y **antes** del cache (viaja cacheado igual que el resto del recorte
crudo, con el mismo TTL corto que ya tolera otros datos ligeramente stale)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ofertas.models import OfertaStatus
from app.modules.remates.lotes.schemas import LoteRead
from app.modules.remates.schemas import RemateRead
from app.presence.schemas import ConnectedUserSummary


class OfertaSnapshotEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    buyer_id: uuid.UUID | None
    amount: Decimal
    status: OfertaStatus
    created_at: datetime
    is_bot: bool = False


class RawRemateState(BaseModel):
    """Forma cacheable en Redis (sin enmascarar) del recorte de estado que sale de
    consultar la base — separado de `RemateStateSnapshot` porque el enmascarado
    depende del `viewer` de cada pedido y el cache, en cambio, es el mismo para
    cualquiera (ver `SnapshotService`, sección de cache)."""

    active_lote: LoteRead | None = None
    winning_offer: OfertaSnapshotEntry | None = None
    recent_offers: list[OfertaSnapshotEntry] = Field(default_factory=list)


class RemateStateSnapshot(BaseModel):
    """Lo que efectivamente recibe un consumidor (HTTP, WebSocket, o lo que sea) —
    siempre ya enmascarado según quién lo pidió.

    `connected_users_detail` (Épica 6, Módulo 6.2) es `None` para cualquier viewer que
    no sea dueño del remate ni admin -- mismo criterio de enmascarado que ya aplica
    `SnapshotService._mask_lote`/`_mask_oferta`. `connected_users` (el conteo) sigue
    visible para cualquiera, sin cambios."""

    schema_version: Annotated[int, Field(default=1)]
    remate: RemateRead
    active_lote: LoteRead | None
    winning_offer: OfertaSnapshotEntry | None
    recent_offers: list[OfertaSnapshotEntry]
    connected_users: int
    connected_users_detail: list[ConnectedUserSummary] | None = None
    generated_at: datetime
