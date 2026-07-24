"""Catálogo de eventos de dominio que se sincronizan en tiempo real (Épica 3, Módulo
3.5). Ver docs/22-sincronizacion-tiempo-real.md y ADR-025.

Whitelist explícita, no "reenviar todo lo que llegue por el canal": un evento nuevo que
se agregue al dominio (`app/modules/*/events.py`) no se sincroniza a clientes hasta que
alguien lo agregue acá a propósito — evita que un evento pensado para auditoría interna
termine expuesto a un cliente sin que nadie lo haya decidido explícitamente.

`RemateCreated` y `RemateScheduled` (catálogo completo en
`app/modules/remates/events.py`) quedan deliberadamente afuera: son eventos de
"antes de que el remate esté en vivo" — no hay razón de negocio para que un cliente
conectado a una sala reciba esa transición en tiempo real todavía (nadie debería tener
una sala abierta para un remate que ni siquiera fue programado). Se documentan como
candidatos naturales si un futuro consumidor los necesita, no como un olvido.
"""

from app.events.base import RemateScopedEvent
from app.moderation.events import (
    ModerationChatLocked,
    ModerationInvalidBidThresholdExceeded,
    ModerationMessagePinned,
    ModerationMessageUnpinned,
    ModerationUserKicked,
    ModerationUserMuted,
)
from app.modules.chat.events import ChatMessageDeleted, ChatMessageSent, ChatUserTyping
from app.modules.ofertas.events import (
    OfertaAccepted,
    OfertaPlaced,
    OfertaRejected,
    OfertaWinnerChanged,
)
from app.modules.remates.events import (
    RemateCancelled,
    RemateFinished,
    RematePaused,
    RemateResumed,
    RemateStarted,
)
from app.modules.remates.lotes.events import (
    LoteCancelled,
    LoteClosed,
    LoteOpened,
    LoteTimerAdjusted,
    LoteTimerAutoCloseToggled,
    LoteTimerExpired,
    LoteTimerExtended,
    LoteTimerPaused,
    LoteTimerReset,
    LoteTimerResumed,
    LoteTimerStarted,
    LoteWinnerDetermined,
)
from app.postauction.events import PostAuctionCaseCreated, PostAuctionStatusChanged
from app.presence.events import PresenceUserConnected, PresenceUserDisconnected

# Orden: mismo agrupamiento que los catálogos de origen (Remate, Lote, Oferta,
# Presencia -- Épica 6, Módulo 6.2 -- Chat -- Épica 6, Módulo 6.4 -- Timer -- Épica 8 --
# PostAuction -- Épica 7, Módulo 7.5 -- Moderación -- Épica 7, Módulo 7.6).
SYNCED_EVENTS: tuple[type[RemateScopedEvent], ...] = (
    RemateStarted,
    RematePaused,
    RemateResumed,
    RemateFinished,
    RemateCancelled,
    LoteOpened,
    LoteClosed,
    LoteCancelled,
    LoteWinnerDetermined,
    LoteTimerStarted,
    LoteTimerPaused,
    LoteTimerResumed,
    LoteTimerReset,
    LoteTimerAdjusted,
    LoteTimerAutoCloseToggled,
    LoteTimerExtended,
    LoteTimerExpired,
    OfertaPlaced,
    OfertaAccepted,
    OfertaRejected,
    OfertaWinnerChanged,
    PresenceUserConnected,
    PresenceUserDisconnected,
    ChatMessageSent,
    ChatMessageDeleted,
    ChatUserTyping,
    PostAuctionCaseCreated,
    PostAuctionStatusChanged,
    ModerationUserKicked,
    ModerationUserMuted,
    ModerationChatLocked,
    ModerationMessagePinned,
    ModerationMessageUnpinned,
    ModerationInvalidBidThresholdExceeded,
)

# `event_type` (el discriminador `Literal` de cada clase) -> la clase concreta, para
# poder revalidar el JSON crudo que llega por Redis Pub/Sub como el tipo correcto antes
# de reenviarlo — nunca se reenvía un `dict` sin validar.
EVENT_REGISTRY: dict[str, type[RemateScopedEvent]] = {
    event_cls.model_fields["event_type"].default: event_cls for event_cls in SYNCED_EVENTS
}
