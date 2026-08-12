"""Estrategias puras de decisión de los bots simuladores de compradores.

Nada acá toca la base de datos, `asyncio` ni `AuctionEngine`/`ChatService` -- son
funciones puras (`rng: random.Random` siempre inyectado, nunca el módulo `random`
global) para poder testear cada decisión de forma determinística con una semilla fija.
El límite exacto entre "cuánto puede pujar" (acá) y "esa oferta es válida" (el motor
real) es deliberado: `decide_bid_amount` calcula un monto candidato usando la MISMA
fórmula de piso mínimo que `AuctionEngine._first_rejection_reason`
(`leading_amount + min_increment`, o `base_price` sin líder) para no ofrecer nunca por
debajo de lo que el motor aceptaría, pero nunca relaja ni reimplementa esa validación:
el `AuctionEngine.place_bid` real es quien decide, con el lote bloqueado, si esa oferta
específica todavía es válida en el momento exacto en que se llama.
"""

import random
from decimal import Decimal

from app.modules.bots.models import BotPersonality

# Multiplicador aplicado sobre `min_increment` para decidir cuánto ofrecer por ENCIMA
# del piso mínimo exigido -- nunca por debajo (eso lo garantiza `decide_bid_amount`).
# Un conservador casi no se despega del incremento mínimo; un agresivo puede ofrecer
# bastante más de una vez, acercándose rápido a su presupuesto.
_INCREMENT_MULTIPLIER_RANGE: dict[BotPersonality, tuple[Decimal, Decimal]] = {
    BotPersonality.CONSERVATIVE: (Decimal("1.0"), Decimal("1.2")),
    BotPersonality.COMPETITIVE: (Decimal("1.0"), Decimal("1.5")),
    BotPersonality.AGGRESSIVE: (Decimal("1.2"), Decimal("2.0")),
}

_CHAT_MESSAGES_BY_TRIGGER_AND_PERSONALITY: dict[str, dict[BotPersonality, list[str]]] = {
    "lote_opened": {
        BotPersonality.CONSERVATIVE: [
            "Voy a mirar este lote.",
            "Me interesa este lote.",
            "Quiero entrar en la puja.",
        ],
        BotPersonality.COMPETITIVE: [
            "Voy por este lote.",
            "Voy por este.",
            "Voy con una oferta.",
            "Este es el que buscaba.",
        ],
        BotPersonality.AGGRESSIVE: ["Este lote es mío."],
    },
    "oferta_accepted": {
        BotPersonality.CONSERVATIVE: [
            "Sigo pensándolo.",
            "Interesante, sigo.",
            "A ese precio me sirve.",
            "Está interesante el precio.",
            "Todavía hay margen.",
            "Todavía estoy.",
        ],
        BotPersonality.COMPETITIVE: [
            "Vamos un poco más.",
            "Ahí voy de nuevo.",
            "Todavía puedo subir.",
            "Puedo mejorar la oferta.",
            "Voy una más.",
            "Todavía tengo margen.",
        ],
        BotPersonality.AGGRESSIVE: [
            "No me van a ganar esto.",
            "Subo otra vez.",
            "No lo voy a dejar pasar.",
            "No aflojo.",
            "A ver quién se lo lleva.",
        ],
    },
    "give_up": {
        BotPersonality.CONSERVATIVE: [
            "Me retiro de este lote.",
            "Ya se está yendo de precio.",
            "Está demasiado caro para mí.",
            "Ya me parece mucho.",
            "Bueno, esta vez no.",
            "Esta vez paso.",
        ],
        BotPersonality.COMPETITIVE: [
            "No voy a seguir subiendo.",
            "A ese precio no llego.",
            "No oferto más.",
            "Ya no me sirve a ese precio.",
            "Me quedé afuera.",
            "Se lo dejo.",
        ],
        BotPersonality.AGGRESSIVE: [
            "Hasta acá llego, por ahora.",
            "Está subiendo demasiado.",
            "Hasta acá llegué.",
            "Me ganaron.",
        ],
    },
    "lote_question": {
        BotPersonality.CONSERVATIVE: ["¿Cuál es el estado del lote?", "¿Tiene documentación?"],
        BotPersonality.COMPETITIVE: ["¿Qué cantidad tiene el lote?", "¿De qué zona proviene?"],
        BotPersonality.AGGRESSIVE: [
            "¿Qué características tiene?",
            "¿Hay más datos sobre este lote?",
        ],
    },
    "thinking": {
        BotPersonality.CONSERVATIVE: ["Voy a esperar un poco."],
        BotPersonality.COMPETITIVE: ["Estoy analizando el lote."],
        BotPersonality.AGGRESSIVE: ["Quiero ver hasta dónde llega."],
    },
}


def decide_bid_amount(
    *,
    leading_amount: Decimal | None,
    base_price: Decimal,
    min_increment: Decimal,
    max_budget: Decimal,
    personality: BotPersonality,
    rng: random.Random,
) -> Decimal | None:
    """`None` si el piso mínimo ya supera el presupuesto del bot -- el bot abandona
    este lote sin llamar al motor. Si no, devuelve un monto entre el piso mínimo y
    `max_budget` (nunca por debajo del piso, nunca por encima del presupuesto)."""
    minimum = (leading_amount + min_increment) if leading_amount is not None else base_price
    if minimum > max_budget:
        return None

    low, high = _INCREMENT_MULTIPLIER_RANGE[personality]
    multiplier = Decimal(str(rng.uniform(float(low), float(high))))
    extra = (min_increment * multiplier).quantize(Decimal("0.01"))
    amount = minimum + extra
    if amount > max_budget:
        amount = max_budget
    return amount.quantize(Decimal("0.01"))


def decide_continue_bidding(continue_probability: Decimal, *, rng: random.Random) -> bool:
    return rng.random() < float(continue_probability)


def decide_send_chat_message(chat_message_frequency: Decimal, *, rng: random.Random) -> bool:
    return rng.random() < float(chat_message_frequency)


def decide_initial_delay_seconds(
    min_seconds: int, max_seconds: int, *, rng: random.Random
) -> float:
    return rng.uniform(min_seconds, max_seconds)


def build_chat_message(trigger: str, *, personality: BotPersonality, rng: random.Random) -> str:
    options = _CHAT_MESSAGES_BY_TRIGGER_AND_PERSONALITY.get(trigger, {}).get(personality)
    if not options:
        options = _CHAT_MESSAGES_BY_TRIGGER_AND_PERSONALITY["oferta_accepted"][personality]
    return rng.choice(options)
