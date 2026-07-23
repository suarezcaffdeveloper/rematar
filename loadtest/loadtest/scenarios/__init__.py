"""Registro de escenarios disponibles -- `cli.py` arma un subcomando por cada uno.
Agregar un escenario nuevo es agregar un módulo con `NAME`/`DESCRIPTION`/
`add_arguments`/`run` acá, sin tocar `cli.py`.
"""

from __future__ import annotations

from types import ModuleType

from loadtest.scenarios import (
    bid_storm,
    chat_concurrency,
    concurrent_remates,
    connected_buyers,
    notifications_broadcast,
)

SCENARIOS: dict[str, ModuleType] = {
    connected_buyers.NAME: connected_buyers,
    concurrent_remates.NAME: concurrent_remates,
    bid_storm.NAME: bid_storm,
    chat_concurrency.NAME: chat_concurrency,
    notifications_broadcast.NAME: notifications_broadcast,
}
