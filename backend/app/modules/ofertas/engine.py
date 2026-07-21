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

## Eventos de dominio (Épica 3, Módulo 3.2)

`place_bid` publica (`app/modules/ofertas/events.py`, después de confirmar la
transacción): `OfertaPlaced` siempre que se persiste una fila (aceptada o rechazada, ver
`_save`), `OfertaAccepted`/`OfertaRejected` según el resultado, y `OfertaWinnerChanged`
cuando una oferta aceptada supera a una vigente anterior. El camino de reintento
idempotente (`client_token` ya existe) no publica nada — no ocurrió nada nuevo. Ver
docs/19-arquitectura-de-eventos.md y ADR-022.

## Auditoría (Épica 7, Módulo 7.2)

`_save` deja constancia vía `AuditLogRepository.record` (ver docs/36 y ADR-039):
`oferta.placed` si la fila persistida quedó `ACCEPTED`, `oferta.rejected` si quedó
`REJECTED` -- en la misma transacción que ya persiste la oferta (antes de su `commit()`
único). No se audita la transición `ACCEPTED -> OUTBID` de la oferta previamente
ganadora: es un efecto secundario de una oferta ya auditada, de alto volumen, no pedido
por el enunciado. El camino de reintento idempotente tampoco audita nada nuevo, mismo
criterio que no publica ningún evento.
"""

import uuid
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.exceptions import ForbiddenError, NotFoundError
from app.events.bus import EventBus
from app.modules.ofertas.events import (
    OfertaAccepted,
    OfertaPlaced,
    OfertaRejected,
    OfertaWinnerChanged,
)
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
        event_bus: EventBus,
        audit_repository: AuditLogRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._lote_repository = lote_repository
        self._event_bus = event_bus
        self._audit_repository = audit_repository

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
            oferta = await self._save(
                oferta, remate_id=remate_id, buyer=buyer, client_token=data.client_token
            )
            await self._event_bus.publish(
                OfertaRejected(
                    remate_id=remate_id,
                    oferta_id=oferta.id,
                    lote_id=lote_id,
                    buyer_id=buyer.id,
                    amount=oferta.amount,
                    reason=reason,
                )
            )
            return oferta

        if leading is not None:
            leading.status = OfertaStatus.OUTBID

        oferta = Oferta(
            lote_id=lote_id,
            buyer_id=buyer.id,
            amount=data.amount,
            status=OfertaStatus.ACCEPTED,
            client_token=data.client_token,
        )
        oferta = await self._save(
            oferta, remate_id=remate_id, buyer=buyer, client_token=data.client_token
        )
        await self._event_bus.publish(
            OfertaAccepted(
                remate_id=remate_id,
                oferta_id=oferta.id,
                lote_id=lote_id,
                buyer_id=buyer.id,
                amount=oferta.amount,
            )
        )
        if leading is not None:
            await self._event_bus.publish(
                OfertaWinnerChanged(
                    remate_id=remate_id,
                    lote_id=lote_id,
                    previous_oferta_id=leading.id,
                    previous_buyer_id=leading.buyer_id,
                    new_oferta_id=oferta.id,
                    new_buyer_id=oferta.buyer_id,
                    new_amount=oferta.amount,
                )
            )
        return oferta

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
        self,
        oferta: Oferta,
        *,
        remate_id: uuid.UUID,
        buyer: User,
        client_token: str | None,
    ) -> Oferta:
        self._repository.add(oferta)
        try:
            # `oferta.id` es un default client-side -- flush lo asigna sin comitear, para
            # poder usarlo como resource_id de la entrada de auditoría en el mismo commit
            # único de abajo (ver docstring del módulo). El `INSERT` real (y por lo tanto
            # cualquier `IntegrityError` de concurrencia) ocurre acá, no en el `commit()`
            # de más abajo -- mismo punto exacto donde ocurría antes de este cambio,
            # dentro de `commit()`, así que la lógica de recuperación de abajo no cambia.
            await self._audit_repository.flush()
        except IntegrityError:
            await self._repository.rollback()
            # Dos reintentos concurrentes del mismo comprador con el mismo client_token
            # pueden pasar ambos el chequeo de idempotencia de `place_bid` si ninguno
            # todavía había confirmado — acá se recupera la fila que sí llegó a
            # persistirse (sin publicar nada: no es un evento nuevo). Si el conflicto no
            # es por el client_token (ej. se violó el invariante "a lo sumo una ACCEPTED
            # por lote", que el lock ya debería impedir), se re-lanza: eso sí es un error
            # inesperado, no un conflicto de negocio esperable.
            if client_token is not None:
                existing = await self._repository.get_by_buyer_and_token(buyer.id, client_token)
                if existing is not None:
                    return existing
            raise

        audit_action = (
            AuditAction.OFERTA_PLACED if oferta.status == OfertaStatus.ACCEPTED else AuditAction.OFERTA_REJECTED
        )
        details: dict = {"lote_id": str(oferta.lote_id), "amount": str(oferta.amount)}
        if oferta.rejection_reason:
            details["reason"] = oferta.rejection_reason
        self._audit_repository.record(
            actor_id=buyer.id,
            actor_name=buyer.full_name,
            actor_role=buyer.role.value,
            action=audit_action,
            resource_type="oferta",
            resource_id=oferta.id,
            remate_id=remate_id,
            details=details,
        )
        await self._repository.commit()
        await self._repository.refresh(oferta)
        await self._event_bus.publish(
            OfertaPlaced(
                remate_id=remate_id,
                oferta_id=oferta.id,
                lote_id=oferta.lote_id,
                buyer_id=oferta.buyer_id,
                amount=oferta.amount,
                status=oferta.status,
            )
        )
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
