"""Prepara remates en estado `LIVE` con un lote `OPEN`, listo para recibir ofertas --
todo vía la API pública del rematador (`POST /remates`, `.../lotes`, `.../schedule`,
`.../start`, `.../lotes/{id}/open`), en el mismo orden que exige el motor de estados
(docs/16-motor-de-estados.md): no hay atajos ni acceso directo a la base.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from loadtest.client_http import HttpClient
from loadtest.config import RunConfig
from loadtest.identity import Identity


@dataclass
class LiveLote:
    remate_id: str
    lote_id: str


async def _create_and_open_one(
    client: HttpClient, headers: dict[str, str], title: str, lot_title: str
) -> LiveLote:
    starts_at = (datetime.now(UTC) + timedelta(seconds=5)).isoformat()
    remate_response = await client.post(
        "/remates",
        json={
            "title": title,
            "category": "otros",
            "starts_at": starts_at,
        },
        headers=headers,
        label="create_remate",
    )
    remate_response.raise_for_status()
    remate_id = remate_response.json()["id"]

    lote_response = await client.post(
        f"/remates/{remate_id}/lotes",
        json={
            "lot_number": "1",
            "title": lot_title,
            "category": "otros",
            "base_price": "100.00",
            "min_increment": "1.00",
        },
        headers=headers,
        label="create_lote",
    )
    lote_response.raise_for_status()
    lote_id = lote_response.json()["id"]

    schedule_response = await client.post(
        f"/remates/{remate_id}/schedule", headers=headers, label="schedule_remate"
    )
    schedule_response.raise_for_status()

    start_response = await client.post(
        f"/remates/{remate_id}/start", headers=headers, label="start_remate"
    )
    start_response.raise_for_status()

    open_response = await client.post(
        f"/remates/{remate_id}/lotes/{lote_id}/open", headers=headers, label="open_lote"
    )
    open_response.raise_for_status()

    return LiveLote(remate_id=remate_id, lote_id=lote_id)


async def ensure_live_lote(config: RunConfig, auctioneer: Identity) -> LiveLote:
    """Un único remate/lote LIVE+OPEN -- usado por los escenarios que concentran carga
    sobre un solo lote (`bid_storm`, `chat_concurrency`, `notifications_broadcast`,
    `connected_buyers`)."""
    run_id = uuid.uuid4().hex[:8]
    headers = {"Authorization": f"Bearer {auctioneer.access_token}"}
    async with HttpClient(config.api_base_url) as client:
        return await _create_and_open_one(
            client,
            headers,
            title=f"Remate de carga {run_id}",
            lot_title=f"Lote de carga {run_id}",
        )


async def ensure_live_lotes(config: RunConfig, auctioneer: Identity, count: int) -> list[LiveLote]:
    """`count` remates LIVE+OPEN independientes -- usado por `concurrent_remates`, que
    necesita salas distintas para repartir compradores entre ellas."""
    run_id = uuid.uuid4().hex[:8]
    headers = {"Authorization": f"Bearer {auctioneer.access_token}"}
    async with HttpClient(config.api_base_url) as client:
        live_lotes: list[LiveLote] = []
        for i in range(count):
            live_lotes.append(
                await _create_and_open_one(
                    client,
                    headers,
                    title=f"Remate de carga {run_id}-{i:03d}",
                    lot_title=f"Lote de carga {run_id}-{i:03d}",
                )
            )
        return live_lotes
