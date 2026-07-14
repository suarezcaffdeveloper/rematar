from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.ofertas.engine import AuctionEngine
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.lotes.dependencies import get_lote_repository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.service import RemateService


def get_oferta_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> OfertaRepository:
    return OfertaRepository(db)


def get_auction_engine(
    repository: Annotated[OfertaRepository, Depends(get_oferta_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    lote_repository: Annotated[LoteRepository, Depends(get_lote_repository)],
) -> AuctionEngine:
    # LoteRepository, no LoteService: el motor solo necesita el lock de fila (ADR-004) y
    # lecturas puntuales del lote, nunca su lógica de negocio — ver ADR-020, sección F.
    return AuctionEngine(repository, remate_service, lote_repository)
