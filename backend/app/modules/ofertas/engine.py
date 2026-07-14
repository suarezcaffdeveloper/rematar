"""Auction Engine (Épica 2.4) — el componente responsable de recibir, validar y procesar
ofertas. Ver docs/17-auction-engine.md (funcionamiento interno, diagrama de flujo) y
docs/adr/ADR-020-diseno-del-auction-engine.md (diseño completo, alternativas, trade-offs).

Nombre de archivo deliberadamente distinto de `service.py`: mismo criterio que
`remates/state_machine.py` (Módulo 2.1) — un componente lo bastante central como para
merecer su propio archivo, no enterrarlo bajo el nombre genérico de cada módulo.

## Transporte-agnóstico a propósito

`place_bid` no sabe nada de HTTP: recibe objetos de dominio ya resueltos (`buyer: User`,
`data: OfertaCreate`) y devuelve una `Oferta` o levanta una excepción de
`app.core.exceptions`. Cuando exista un handler de WebSocket, va a llamar exactamente a
este método — ver ADR-020, sección G.

## Reglas duras vs. blandas (ver docs/17-auction-engine.md para la tabla completa)

- **Duras** (nunca generan una fila, levantan `ForbiddenError`/`NotFoundError`): rol
  distinto de `comprador`, cuenta suspendida, remate no visible, lote inexistente o de
  otro remate.
- **Blandas** (generan una `Oferta REJECTED` con motivo, la solicitud HTTP igual
  devuelve 201): remate no `LIVE`, lote no `OPEN`, monto insuficiente.

## Concurrencia

Todo el procesamiento corre dentro de la transacción que abre
`LoteRepository.get_by_id_for_update` (`SELECT ... FOR UPDATE`, ADR-004 de Fase 0) — el
lock de esa fila puntual del lote serializa toda oferta concurrente sobre él, sin
importar la instancia de backend que la reciba.
"""

import uuid
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.ofertas.models import Oferta, OfertaStatus
from app.modules.ofertas.repository import OfertaRepository
from app.modules.ofertas.schemas import OfertaCreate
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate, RemateStatus
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole


class AuctionEngine:
    def __init__(
        self,
        repository: OfertaRepository,
        remate_service: RemateService,
        lote_repository: LoteRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._lote_repository = lote_repository

    async def place_bid(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, buyer: User, data: OfertaCreate
    ) -> Oferta:
        # --- Reglas duras: nunca generan una fila -------------------------------
        if buyer.role != UserRole.COMPRADOR:
            raise ForbiddenError("Solo los compradores pueden ofertar.")
        if not buyer.is_active:
            raise ForbiddenError("Tu cuenta está suspendida; no podés ofertar.")

        if data.client_token is not None:
            existing = await self._repository.get_by_buyer_and_token(
                buyer.id, data.client_token
            )
            if existing is not None:
                return existing

        # Visibilidad del remate: mismo criterio 404 (no 403) que el resto de la API —
        # reutiliza RemateService.get_visible_or_raise sin cambios.
        remate = await self._remate_service.get_visible_or_raise(remate_id, buyer)

        # Lock de fila (ADR-004): serializa toda oferta concurrente sobre este lote.
        lote = await self._lote_repository.get_by_id_for_update(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        # --- Reglas blandas: siempre generan una fila (ACCEPTED o REJECTED) -----
        leading = await self._repository.get_leading_offer(lote_id)
        reason = self._first_rejection_reason(remate, lote, data.amount, leading)

        if reason is not None:
            oferta = Oferta(
                lote_id=lote_id,
                buyer_id=buyer.id,
                amount=data.amount,
                status=OfertaStatus.REJECTED,
                rejection_reason=reason,
                client_token=data.client_token,
            )
            return await self._save(oferta, buyer_id=buyer.id, client_token=data.client_token)

        if leading is not None:
            leading.status = OfertaStatus.OUTBID

        oferta = Oferta(
            lote_id=lote_id,
            buyer_id=buyer.id,
            amount=data.amount,
            status=OfertaStatus.ACCEPTED,
            client_token=data.client_token,
        )
        return await self._save(oferta, buyer_id=buyer.id, client_token=data.client_token)

    @staticmethod
    def _first_rejection_reason(
        remate: Remate, lote: Lote, amount: Decimal, leading: Oferta | None
    ) -> str | None:
        if remate.status != RemateStatus.LIVE:
            if remate.status == RemateStatus.PAUSED:
                return "El remate está pausado."
            return "El remate no está en vivo."

        if lote.status != LoteStatus.OPEN:
            if lote.status == LoteStatus.PENDING:
                return "El lote todavía no fue abierto."
            return "El lote ya fue cerrado o cancelado."

        minimum = (leading.amount + lote.min_increment) if leading is not None else lote.base_price
        if amount < minimum:
            return f"El monto debe ser al menos {minimum} (incremento mínimo no alcanzado)."

        return None

    async def _save(
        self, oferta: Oferta, *, buyer_id: uuid.UUID, client_token: str | None
    ) -> Oferta:
        self._repository.add(oferta)
        try:
            await self._repository.commit()
        except IntegrityError:
            await self._repository.rollback()
            # Dos reintentos concurrentes del mismo comprador con el mismo client_token
            # pueden pasar ambos el chequeo de idempotencia de `place_bid` si ninguno
            # todavía había confirmado — acá se recupera la fila que sí llegó a
            # persistirse. Si el conflicto no es por el client_token (ej. se violó el
            # invariante "a lo sumo una ACCEPTED por lote", que el lock ya debería
            # impedir), se re-lanza: eso sí es un error inesperado, no un conflicto de
            # negocio esperable.
            if client_token is not None:
                existing = await self._repository.get_by_buyer_and_token(buyer_id, client_token)
                if existing is not None:
                    return existing
            raise
        await self._repository.refresh(oferta)
        return oferta

    async def get_leading_amount(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, viewer: User
    ) -> Decimal | None:
        await self._remate_service.get_visible_or_raise(remate_id, viewer)
        lote = await self._lote_repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        leading = await self._repository.get_leading_offer(lote_id)
        return leading.amount if leading is not None else None

    async def list_history(
        self,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        viewer: User,
        *,
        page: int,
        page_size: int,
    ) -> tuple[list[Oferta], int]:
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        if viewer.role != UserRole.ADMIN and remate.owner_id != viewer.id:
            raise ForbiddenError(
                "Solo el rematador dueño del remate (o un administrador) puede ver el "
                "historial de ofertas."
            )

        lote = await self._lote_repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")

        offset = (page - 1) * page_size
        return await self._repository.list_by_lote(lote_id=lote_id, offset=offset, limit=page_size)
