"""`TimerService` -- ver docs/40-cuenta-regresiva-y-cierre-automatico.md y ADR-043.

Combina dos niveles de superficie:

1. **Mutadores puros** (`start_for_lote`, `maybe_extend_for_bid`): mutan el `Lote` ya
   cargado por el caller, en memoria, sin `commit()` ni publicar nada -- el caller
   (`LoteService.open`/`open_next`, `AuctionEngine.place_bid`) ya está dentro de su
   propia transacción con un único `commit()` ya existente, y publica el evento que
   estos métodos devuelven *después* de ese commit, exactamente igual que cualquier
   otro evento del proyecto. `maybe_extend_for_bid` en particular **debe** ser síncrono
   y correr dentro de la misma transacción que acepta la oferta (ADR-043): un consumidor
   de eventos separado podría procesar la extensión después de que
   `TimerExpiryScheduler` ya cerró el lote, perdiendo la extensión justo en el caso que
   más importa (el último segundo).
2. **Acciones del rematador** (`pause`/`resume`/`reset`/`set_remaining`/
   `set_auto_close_enabled`): flujo completo -- verifica ownership
   (`RemateService.get_owned_or_raise`), carga el lote, valida que tenga un timer en
   curso, muta, audita, comitea, refresca, publica, devuelve el `Lote` actualizado.
   Mismo criterio de permisos que `LoteService.close`/`cancel`.
"""

import uuid
from datetime import UTC, datetime, timedelta

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.events.bus import EventBus
from app.modules.remates.lotes.events import (
    LoteTimerAdjusted,
    LoteTimerAutoCloseToggled,
    LoteTimerExtended,
    LoteTimerPaused,
    LoteTimerReset,
    LoteTimerResumed,
    LoteTimerStarted,
)
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate
from app.modules.remates.schemas import RemateSettings
from app.modules.remates.service import RemateService
from app.modules.users.models import User


class TimerService:
    def __init__(
        self,
        repository: LoteRepository,
        remate_service: RemateService,
        event_bus: EventBus,
        audit_repository: AuditLogRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._event_bus = event_bus
        self._audit_repository = audit_repository

    # --- Mutadores puros (sin commit/publish) -------------------------------------

    @staticmethod
    def start_for_lote(lote: Lote, remate: Remate) -> LoteTimerStarted | None:
        """Llamado por `LoteService.open`/`open_next` antes de su commit. `None` si el
        remate no configuró `settings.lote_timer_seconds` -- ningún campo se toca, el
        lote queda exactamente como antes de este módulo."""
        settings = RemateSettings.model_validate(remate.settings)
        if settings.lote_timer_seconds is None:
            return None
        duration = settings.lote_timer_seconds
        ends_at = datetime.now(UTC) + timedelta(seconds=duration)
        lote.timer_ends_at = ends_at
        lote.timer_paused_remaining_seconds = None
        lote.timer_auto_close_enabled = True
        return LoteTimerStarted(
            remate_id=remate.id, lote_id=lote.id, ends_at=ends_at, duration_seconds=duration
        )

    @staticmethod
    def maybe_extend_for_bid(lote: Lote, remate: Remate) -> LoteTimerExtended | None:
        """Llamado por `AuctionEngine.place_bid` (rama ACCEPTED) antes de su commit.
        `None` si el lote no tiene timer corriendo, si el remate no habilitó
        anti-sniping, o si la oferta llegó fuera de la ventana de extensión -- en
        cualquiera de esos casos, el lote no se toca."""
        if lote.timer_ends_at is None:
            return None
        settings = RemateSettings.model_validate(remate.settings)
        if not settings.anti_sniping_enabled:
            return None

        window_seconds = settings.anti_sniping_extension_seconds
        now = datetime.now(UTC)
        remaining = (lote.timer_ends_at - now).total_seconds()
        if remaining > window_seconds:
            return None

        new_ends_at = now + timedelta(seconds=window_seconds)
        lote.timer_ends_at = new_ends_at
        return LoteTimerExtended(
            remate_id=remate.id,
            lote_id=lote.id,
            ends_at=new_ends_at,
            extended_by_seconds=window_seconds,
        )

    # --- Acciones del rematador (flujo completo) ----------------------------------

    async def _get_owned_lote_with_timer(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User
    ) -> tuple[Remate, Lote]:
        remate = await self._remate_service.get_owned_or_raise(remate_id, owner)
        lote = await self._repository.get_by_id(lote_id)
        if lote is None or lote.remate_id != remate_id:
            raise NotFoundError("Lote no encontrado.")
        if lote.status != LoteStatus.OPEN:
            raise BusinessRuleError(
                "El timer solo puede controlarse mientras el lote está abierto.",
                current_status=lote.status.value,
            )
        if lote.timer_ends_at is None and lote.timer_paused_remaining_seconds is None:
            raise BusinessRuleError("Este lote no tiene un timer en curso.")
        return remate, lote

    def _record(
        self, lote: Lote, remate_id: uuid.UUID, owner: User, action: str, details: dict
    ) -> None:
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=action,
            resource_type="lote",
            resource_id=lote.id,
            remate_id=remate_id,
            details=details,
        )

    async def pause(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> Lote:
        remate, lote = await self._get_owned_lote_with_timer(remate_id, lote_id, owner)
        if lote.timer_ends_at is None:
            raise BusinessRuleError("El timer ya está pausado.")

        remaining = max(0, int((lote.timer_ends_at - datetime.now(UTC)).total_seconds()))
        lote.timer_paused_remaining_seconds = remaining
        lote.timer_ends_at = None
        self._record(
            lote, remate_id, owner, AuditAction.LOTE_TIMER_PAUSED, {"remaining_seconds": remaining}
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteTimerPaused(remate_id=remate.id, lote_id=lote.id, remaining_seconds=remaining)
        )
        return lote

    async def resume(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> Lote:
        remate, lote = await self._get_owned_lote_with_timer(remate_id, lote_id, owner)
        if lote.timer_paused_remaining_seconds is None:
            raise BusinessRuleError("El timer no está pausado.")

        ends_at = datetime.now(UTC) + timedelta(seconds=lote.timer_paused_remaining_seconds)
        lote.timer_ends_at = ends_at
        lote.timer_paused_remaining_seconds = None
        self._record(lote, remate_id, owner, AuditAction.LOTE_TIMER_RESUMED, {})
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteTimerResumed(remate_id=remate.id, lote_id=lote.id, ends_at=ends_at)
        )
        return lote

    async def reset(self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User) -> Lote:
        remate, lote = await self._get_owned_lote_with_timer(remate_id, lote_id, owner)
        settings = RemateSettings.model_validate(remate.settings)
        if settings.lote_timer_seconds is None:
            raise BusinessRuleError("Este remate no tiene configurado un timer por lote.")

        duration = settings.lote_timer_seconds
        ends_at = datetime.now(UTC) + timedelta(seconds=duration)
        lote.timer_ends_at = ends_at
        lote.timer_paused_remaining_seconds = None
        self._record(
            lote, remate_id, owner, AuditAction.LOTE_TIMER_RESET, {"duration_seconds": duration}
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteTimerReset(remate_id=remate.id, lote_id=lote.id, ends_at=ends_at, duration_seconds=duration)
        )
        return lote

    async def set_remaining(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User, seconds: int
    ) -> Lote:
        remate, lote = await self._get_owned_lote_with_timer(remate_id, lote_id, owner)

        ends_at: datetime | None
        if lote.timer_ends_at is not None:
            ends_at = datetime.now(UTC) + timedelta(seconds=seconds)
            lote.timer_ends_at = ends_at
        else:
            ends_at = None
            lote.timer_paused_remaining_seconds = seconds

        self._record(
            lote, remate_id, owner, AuditAction.LOTE_TIMER_ADJUSTED, {"remaining_seconds": seconds}
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteTimerAdjusted(
                remate_id=remate.id, lote_id=lote.id, ends_at=ends_at, remaining_seconds=seconds
            )
        )
        return lote

    async def set_auto_close_enabled(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, owner: User, enabled: bool
    ) -> Lote:
        remate, lote = await self._get_owned_lote_with_timer(remate_id, lote_id, owner)
        lote.timer_auto_close_enabled = enabled
        self._record(
            lote, remate_id, owner, AuditAction.LOTE_TIMER_AUTO_CLOSE_TOGGLED, {"enabled": enabled}
        )
        await self._repository.commit()
        await self._repository.refresh(lote)
        await self._event_bus.publish(
            LoteTimerAutoCloseToggled(remate_id=remate.id, lote_id=lote.id, enabled=enabled)
        )
        return lote
