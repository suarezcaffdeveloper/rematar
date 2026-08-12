"""Tests de las funciones puras de `app/modules/bots/strategy.py` -- sin base de datos
ni Redis: todo determinístico vía `random.Random(seed)`. Cubren específicamente los
requisitos de negocio que el enunciado pide validar: respeto del presupuesto máximo,
respeto del incremento mínimo (nunca por debajo del piso real del motor), y los bordes
de probabilidad de "seguir ofertando"/"mandar un mensaje de chat".
"""

import random
from decimal import Decimal

from app.modules.bots.models import BotPersonality
from app.modules.bots.strategy import (
    build_chat_message,
    decide_bid_amount,
    decide_continue_bidding,
    decide_initial_delay_seconds,
    decide_send_chat_message,
)


def test_decide_bid_amount_without_leader_is_at_least_base_price() -> None:
    rng = random.Random(1)
    amount = decide_bid_amount(
        leading_amount=None,
        base_price=Decimal("1000.00"),
        min_increment=Decimal("100.00"),
        max_budget=Decimal("5000.00"),
        personality=BotPersonality.COMPETITIVE,
        rng=rng,
    )
    assert amount is not None
    assert amount >= Decimal("1000.00")


def test_decide_bid_amount_with_leader_respects_minimum_increment() -> None:
    """El piso nunca puede ser menor que `leading_amount + min_increment` -- la misma
    fórmula que usa `AuctionEngine._first_rejection_reason` para rechazar una oferta."""
    rng = random.Random(2)
    for _ in range(50):
        amount = decide_bid_amount(
            leading_amount=Decimal("1000.00"),
            base_price=Decimal("500.00"),
            min_increment=Decimal("50.00"),
            max_budget=Decimal("5000.00"),
            personality=BotPersonality.CONSERVATIVE,
            rng=rng,
        )
        assert amount is not None
        assert amount >= Decimal("1050.00")


def test_decide_bid_amount_never_exceeds_max_budget() -> None:
    rng = random.Random(3)
    for _ in range(50):
        amount = decide_bid_amount(
            leading_amount=Decimal("900.00"),
            base_price=Decimal("500.00"),
            min_increment=Decimal("50.00"),
            max_budget=Decimal("950.00"),
            personality=BotPersonality.AGGRESSIVE,
            rng=rng,
        )
        assert amount is not None
        assert amount <= Decimal("950.00")


def test_decide_bid_amount_returns_none_when_floor_exceeds_budget() -> None:
    """El bot abandona el lote (sin llamar nunca al motor) cuando ni siquiera el piso
    mínimo exigido entra en su presupuesto."""
    rng = random.Random(4)
    amount = decide_bid_amount(
        leading_amount=Decimal("1000.00"),
        base_price=Decimal("500.00"),
        min_increment=Decimal("100.00"),
        max_budget=Decimal("1050.00"),  # el piso (1000 + 100 = 1100) ya lo supera
        personality=BotPersonality.AGGRESSIVE,
        rng=rng,
    )
    assert amount is None


def test_decide_bid_amount_returns_none_when_budget_equals_leading_amount() -> None:
    rng = random.Random(5)
    amount = decide_bid_amount(
        leading_amount=Decimal("1000.00"),
        base_price=Decimal("500.00"),
        min_increment=Decimal("100.00"),
        max_budget=Decimal("1000.00"),
        personality=BotPersonality.CONSERVATIVE,
        rng=rng,
    )
    assert amount is None


def test_decide_continue_bidding_probability_zero_never_continues() -> None:
    rng = random.Random(6)
    assert all(
        decide_continue_bidding(Decimal("0"), rng=rng) is False for _ in range(50)
    )


def test_decide_continue_bidding_probability_one_always_continues() -> None:
    rng = random.Random(7)
    assert all(
        decide_continue_bidding(Decimal("1"), rng=rng) is True for _ in range(50)
    )


def test_decide_send_chat_message_probability_zero_never_sends() -> None:
    rng = random.Random(8)
    assert all(
        decide_send_chat_message(Decimal("0"), rng=rng) is False for _ in range(50)
    )


def test_decide_send_chat_message_probability_one_always_sends() -> None:
    rng = random.Random(9)
    assert all(
        decide_send_chat_message(Decimal("1"), rng=rng) is True for _ in range(50)
    )


def test_decide_initial_delay_seconds_stays_within_window() -> None:
    rng = random.Random(10)
    for _ in range(50):
        delay = decide_initial_delay_seconds(2, 5, rng=rng)
        assert 2 <= delay <= 5


def test_build_chat_message_returns_non_empty_text_for_every_personality() -> None:
    rng = random.Random(11)
    for personality in BotPersonality:
        for trigger in ("lote_opened", "oferta_accepted", "give_up", "lote_question", "thinking"):
            message = build_chat_message(trigger, personality=personality, rng=rng)
            assert isinstance(message, str)
            assert message.strip() != ""


def test_build_chat_message_falls_back_for_unknown_trigger() -> None:
    rng = random.Random(12)
    message = build_chat_message(
        "unknown_trigger", personality=BotPersonality.COMPETITIVE, rng=rng
    )
    assert message.strip() != ""
