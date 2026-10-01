"""`GarantiaService` -- ciclo de vida del bloqueo de tarjeta (garantía económica) que una
empresa puede exigir para ofertar en su remate.

Compone `RemateService` (no `RemateRepository` directo) para resolver/autorizar el
remate: `get_visible_or_raise` ya centraliza la regla de visibilidad (borrador ajeno,
privado sin grant, etc.) -- mismo criterio que `AuctionEngine.place_bid`
(`app/modules/ofertas/engine.py`), que reutiliza esa misma función en vez de duplicarla
contra el repositorio. Dirección de dependencia `garantias -> remates`, nunca al revés.

Una tarjeta rechazada por Mercado Pago (o un error de red hacia su API) NO se propaga
como excepción desde `create_or_retry`: la `Garantia` queda persistida en `FAILED` con
`failure_reason`, y el caller (router) responde 201 con ese estado -- es un resultado de
negocio esperable (como una oferta `REJECTED` en `AuctionEngine`), no un error del
sistema. `assert_active_or_raise` sí lanza (`ForbiddenError`): ese es el gate real que
usa `AuctionEngine.place_bid` antes de aceptar una puja.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.modules.garantias.mercadopago_client import MercadoPagoClient, MercadoPagoError
from app.modules.garantias.models import Garantia, GarantiaEvent, GarantiaStatus
from app.modules.garantias.notifications import GarantiaEmailNotifier
from app.modules.garantias.repository import GarantiaRepository
from app.modules.remates.schemas import RemateSettings
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

logger = structlog.get_logger(__name__)

# Estados de Mercado Pago que dejan la garantía en un estado propio terminal fallido --
# ver docstring de `mercadopago_client.py` para la referencia de la API.
_MP_FAILED_STATUSES = {"rejected", "cancelled"}


class GarantiaService:
    def __init__(
        self,
        repository: GarantiaRepository,
        remate_service: RemateService,
        mp_client: MercadoPagoClient,
        settings: Settings,
        notifier: GarantiaEmailNotifier,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._mp_client = mp_client
        self._settings = settings
        self._notifier = notifier

    # --- Constitución del hold ---------------------------------------------------------

    async def create_or_retry(
        self,
        *,
        remate_id: uuid.UUID,
        buyer: User,
        card_payment_data: dict[str, Any],
    ) -> Garantia:
        if buyer.role != UserRole.COMPRADOR:
            raise ForbiddenError("Solo los compradores pueden constituir una garantía.")

        # Capturado ANTES de cualquier operación de base -- si más abajo hace falta un
        # `rollback()` (carrera de doble submit), este objeto `buyer` queda con sus
        # atributos expirados por el propio rollback; releerlo recién ahí como
        # `buyer.id` dispararía una recarga perezosa fuera de un contexto async válido
        # (`MissingGreenlet`). Un `uuid.UUID` plano no tiene ese problema.
        buyer_id = buyer.id
        buyer_email = buyer.email

        remate = await self._remate_service.get_visible_or_raise(remate_id, buyer)
        settings = RemateSettings.model_validate(remate.settings)
        if not settings.guarantee_required:
            raise BusinessRuleError("Este remate no exige garantía económica.")
        # Invariante de `RemateSettings._validate_guarantee`: si `guarantee_required` es
        # true, `guarantee_amount` no puede ser `None`.
        assert settings.guarantee_amount is not None

        existing = await self._repository.get_by_remate_and_buyer(remate_id, buyer_id)
        if existing is not None and existing.status in (
            GarantiaStatus.ACTIVE,
            GarantiaStatus.PENDING_AUTHORIZATION,
        ):
            return existing  # idempotente: ya hay un hold vivo, no se llama a MP de nuevo.

        garantia = existing or Garantia(remate_id=remate_id, buyer_id=buyer_id)
        garantia.amount = settings.guarantee_amount
        garantia.currency = settings.currency
        garantia.failure_reason = None
        if existing is None:
            self._repository.add(garantia)
        try:
            await self._repository.flush()  # asegura garantia.id para el evento, si es nueva.
        except IntegrityError:
            # Doble click / dos pestañas: otra request concurrente ganó la carrera e
            # insertó la fila para este (remate_id, buyer_id) entre nuestro SELECT y este
            # INSERT (viola `uq_garantias_remate_id_buyer_id`). No es un error real -- ya
            # hay un hold en curso, mismo criterio idempotente que el chequeo de arriba,
            # solo que la carrera lo esconde de esa lectura inicial. Sin este manejo,
            # esto se propagaba como un 500 genérico en vez de devolver el resultado real.
            await self._repository.rollback()
            winner = await self._repository.get_by_remate_and_buyer(remate_id, buyer_id)
            assert winner is not None  # tiene que existir: eso es justo lo que violó el unique.
            return winner

        try:
            result = await self._mp_client.create_hold(
                amount=settings.guarantee_amount,
                currency=settings.currency,
                description=f"Garantía económica -- remate {remate.title}",
                external_reference=f"garantia:{remate_id}:{buyer_id}",
                payer_email=buyer_email,
                card_payment_data=card_payment_data,
            )
        except MercadoPagoError as exc:
            logger.warning("garantia_create_hold_failed", garantia_id=str(garantia.id))
            garantia.status = GarantiaStatus.FAILED
            garantia.failure_reason = str(exc)
            self._repository.add_event(
                GarantiaEvent(
                    garantia_id=garantia.id,
                    occurred_at=datetime.now(UTC),
                    event_type="create_hold_failed",
                    details={"error": str(exc)},
                )
            )
            await self._repository.commit()
            await self._repository.refresh(garantia)
            return garantia

        self._apply_mp_result(garantia, result.payment_id, result.status)
        self._repository.add_event(
            GarantiaEvent(
                garantia_id=garantia.id,
                occurred_at=datetime.now(UTC),
                event_type="created",
                details=result.raw,
            )
        )
        await self._repository.commit()
        await self._repository.refresh(garantia)

        if garantia.status == GarantiaStatus.ACTIVE:
            # Best-effort -- `GarantiaEmailNotifier` nunca lanza, ver su docstring. Solo
            # cubre la autorización síncrona (la respuesta de este mismo request); una
            # confirmación tardía por webhook (`reconcile`, PENDING_AUTHORIZATION ->
            # ACTIVE) no dispara este email -- en la práctica un hold de tarjeta con
            # Secure Fields resuelve síncrono, a diferencia de otros medios de pago de MP.
            assert garantia.authorized_at is not None  # invariante: lo fija `_apply_mp_result`.
            await self._notifier.send_garantia_autorizada(
                to=buyer_email,
                to_name=buyer.full_name,
                remate_title=remate.title,
                amount=garantia.amount,
                currency=garantia.currency,
                authorized_at=garantia.authorized_at,
                expires_at=garantia.expires_at,
            )
        return garantia

    def _apply_mp_result(self, garantia: Garantia, mp_payment_id: str, mp_status: str) -> None:
        garantia.mp_payment_id = mp_payment_id
        garantia.mp_status = mp_status
        if mp_status == "authorized":
            garantia.status = GarantiaStatus.ACTIVE
            garantia.authorized_at = datetime.now(UTC)
            garantia.expires_at = garantia.authorized_at + timedelta(
                days=self._settings.MERCADOPAGO_HOLD_VALIDITY_DAYS
            )
        elif mp_status in _MP_FAILED_STATUSES:
            garantia.status = GarantiaStatus.FAILED
            garantia.failure_reason = f"Mercado Pago: {mp_status}"
        else:
            # "pending", "in_process", etc. -- la confirmación final llega por webhook
            # (`handle_webhook`/`reconcile`), no bloqueante acá.
            garantia.status = GarantiaStatus.PENDING_AUTHORIZATION

    # --- Gate para ofertar (usado por `AuctionEngine.place_bid`) -----------------------

    async def assert_active_or_raise(self, remate_id: uuid.UUID, buyer_id: uuid.UUID) -> None:
        garantia = await self._repository.get_by_remate_and_buyer(remate_id, buyer_id)
        if garantia is None or garantia.status != GarantiaStatus.ACTIVE:
            raise ForbiddenError(
                "Este remate requiere una garantía económica activa para poder ofertar."
            )

    # --- Cierre del remate: liberar o capturar ------------------------------------------

    async def release(self, garantia: Garantia, *, reason: str) -> Garantia:
        if garantia.status != GarantiaStatus.ACTIVE:
            return garantia  # idempotente -- ya resuelta (o nunca llegó a ACTIVE).

        assert garantia.mp_payment_id is not None  # invariante: ACTIVE siempre lo tiene.
        result = await self._mp_client.cancel(garantia.mp_payment_id)

        garantia.status = GarantiaStatus.RELEASED
        garantia.released_at = datetime.now(UTC)
        garantia.release_reason = reason
        garantia.mp_status = result.status
        self._repository.add_event(
            GarantiaEvent(
                garantia_id=garantia.id,
                occurred_at=garantia.released_at,
                event_type="released",
                details={"reason": reason, **result.raw},
            )
        )
        await self._repository.commit()
        await self._repository.refresh(garantia)
        return garantia

    async def capture(self, garantia: Garantia, *, amount: Decimal | None = None) -> Garantia:
        if garantia.status != GarantiaStatus.ACTIVE:
            return garantia  # idempotente.

        assert garantia.mp_payment_id is not None
        result = await self._mp_client.capture(garantia.mp_payment_id, amount=amount)

        garantia.status = GarantiaStatus.CAPTURED
        garantia.captured_at = datetime.now(UTC)
        garantia.captured_amount = amount if amount is not None else garantia.amount
        garantia.mp_status = result.status
        self._repository.add_event(
            GarantiaEvent(
                garantia_id=garantia.id,
                occurred_at=garantia.captured_at,
                event_type="captured",
                details=result.raw,
            )
        )
        await self._repository.commit()
        await self._repository.refresh(garantia)
        return garantia

    # --- Reconciliación (webhook y scheduler de respaldo) -------------------------------

    async def reconcile(self, garantia: Garantia) -> Garantia:
        """Reconsulta el estado real en Mercado Pago y actualiza la fila -- nunca se
        confía ciegamente en el body de un webhook (puede llegar desordenado o
        duplicado); esto es lo único que sí se confía como fuente de verdad."""
        if garantia.status not in (GarantiaStatus.PENDING_AUTHORIZATION, GarantiaStatus.ACTIVE):
            return garantia  # ya en un estado terminal, nada que reconciliar.
        if garantia.mp_payment_id is None:
            return garantia  # nunca llegó a crearse el pago del lado de MP.

        result = await self._mp_client.get_status(garantia.mp_payment_id)
        previous_status = garantia.status
        self._apply_mp_result(garantia, result.payment_id, result.status)
        if garantia.status != previous_status:
            self._repository.add_event(
                GarantiaEvent(
                    garantia_id=garantia.id,
                    occurred_at=datetime.now(UTC),
                    event_type="webhook_received",
                    details=result.raw,
                )
            )
            await self._repository.commit()
            await self._repository.refresh(garantia)
        return garantia

    async def get_for_buyer(self, remate_id: uuid.UUID, buyer_id: uuid.UUID) -> Garantia | None:
        return await self._repository.get_by_remate_and_buyer(remate_id, buyer_id)

    async def get_by_id_or_raise(self, garantia_id: uuid.UUID) -> Garantia:
        garantia = await self._repository.get_by_id(garantia_id)
        if garantia is None:
            raise NotFoundError("Garantía no encontrada.")
        return garantia
