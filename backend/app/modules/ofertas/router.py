"""Endpoints del recurso `Oferta`, anidados bajo
`/remates/{remate_id}/lotes/{lote_id}/ofertas` (montado en
`app/modules/remates/lotes/router.py`).

Cada endpoint delega enteramente en `AuctionEngine`, sin lógica propia acá — ver
docs/17-auction-engine.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.common.schemas import Page
from app.modules.auth.dependencies import get_current_user
from app.modules.ofertas.dependencies import get_auction_engine
from app.modules.ofertas.engine import AuctionEngine
from app.modules.ofertas.models import Oferta
from app.modules.ofertas.schemas import LeadingOfferRead, OfertaCreate, OfertaRead
from app.modules.users.models import User

router = APIRouter()


@router.post(
    "",
    response_model=OfertaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Ofertar sobre un lote (RF-17) — siempre 201, el resultado va en el cuerpo",
)
async def place_bid(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    data: OfertaCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    engine: Annotated[AuctionEngine, Depends(get_auction_engine)],
) -> Oferta:
    return await engine.place_bid(remate_id, lote_id, current_user, data)


@router.get(
    "/leading",
    response_model=LeadingOfferRead,
    summary="Monto de la oferta vigente del lote (null si todavía no hay ninguna)",
)
async def get_leading_offer(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    engine: Annotated[AuctionEngine, Depends(get_auction_engine)],
) -> LeadingOfferRead:
    amount = await engine.get_leading_amount(remate_id, lote_id, current_user)
    return LeadingOfferRead(amount=amount)


@router.get(
    "",
    response_model=Page[OfertaRead],
    summary="Historial completo de ofertas de un lote, incluidas rechazadas (RF-24)",
)
async def list_ofertas(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    engine: Annotated[AuctionEngine, Depends(get_auction_engine)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[OfertaRead]:
    items, total = await engine.list_history(
        remate_id, lote_id, current_user, page=page, page_size=page_size
    )
    return Page[OfertaRead](items=list(items), total=total, page=page, page_size=page_size)
