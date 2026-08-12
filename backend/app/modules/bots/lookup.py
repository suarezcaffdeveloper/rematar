"""Resolución de identidad bot vs. comprador real.

Existe para que `SnapshotService` pueda exponer `is_bot` en `OfertaSnapshotEntry` sin
que `AuctionEngine`/`ChatService` (ni `OfertaRead`/`ChatMessageRead`) sepan que los bots
existen -- ver el razonamiento completo en el docstring de
`app/snapshot/schemas.py::OfertaSnapshotEntry`.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bots.models import BotProfile


class BotIdentityResolver:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def resolve(self, user_ids: list[uuid.UUID]) -> set[uuid.UUID]:
        """Subconjunto de `user_ids` que corresponde a un bot -- una única consulta
        indexada (`user_id` es `UNIQUE` en `bot_profiles`), sin importar cuántos ids se
        pidan de una vez."""
        if not user_ids:
            return set()
        stmt = select(BotProfile.user_id).where(BotProfile.user_id.in_(user_ids))
        return set((await self._db.execute(stmt)).scalars().all())
