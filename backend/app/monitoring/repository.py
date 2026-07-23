"""Acceso a datos del Monitoring Service (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.

Dos consultas nuevas, deliberadamente **globales** (toda la plataforma, no un remate
puntual) -- a diferencia de `AnalyticsRepository.count_ofertas_since` (per-remate, `JOIN
lotes`), acá no hay ningún filtro por remate. Mismo criterio del resto de los
compositores de solo lectura (`AnalyticsRepository`, `HistoryRepository`): consultas
propias, directas sobre los modelos de otros módulos, sin tocar sus repositorios.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.ofertas.models import Oferta


class MonitoringRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def count_chat_messages_since(self, since: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.kind == ChatMessageKind.USER, ChatMessage.created_at >= since)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def count_ofertas_since(self, since: datetime) -> int:
        stmt = select(func.count()).select_from(Oferta).where(Oferta.created_at >= since)
        return (await self._db.execute(stmt)).scalar_one()
