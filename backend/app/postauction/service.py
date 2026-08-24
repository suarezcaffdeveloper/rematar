"""`PostAuctionService` (Épica 7, Módulo 7.5). Ver docs/41-gestion-post-remate.md y
ADR-044.

Compone `RemateRepository`/`LoteRepository`/`UserRepository` directo (nunca sus
`Service`) para resolver título de remate/lote y nombre de comprador/rematador -- mismo
criterio "repositorio del vecino, no su service" que ya usan `HistoryService`/
`LoteService` (ver ADR-019): la ownership acá no necesita `RemateService.get_owned_or_raise`
porque `PostAuctionCase.rematador_id` ya es el owner del remate, denormalizado al crear el
caso -- comparar contra `viewer.id` alcanza, sin resolver el remate para autorizar. Pese
al nombre de la columna (nunca renombrado, ver ADR-047), desde ese ADR es siempre la
**empresa** dueña del remate, no el rematador-operador: la gestión de postventa quedó
fuera del alcance del rol `rematador` acotado.

`create_case_from_winner` es el único punto de entrada que no llega por HTTP: lo llama
`PostAuctionEventDispatcher` (`realtime.py`) al reaccionar a `lote.winner_determined`
(adjudicación automática) o a `lote.closed` manual con una oferta `ACCEPTED` real
(adjudicación manual con motor de ofertas -- ver el docstring de `realtime.py`). Es
idempotente sobre `lote_id` (única por caso) -- un evento redespachado, dos instancias
del dispatcher, o que ambos eventos de un mismo lote lleguen a resolverse (no debería
pasar, `lote.closed` manual y `lote.winner_determined` son mutuamente excluyentes por
`triggered_by`, pero tampoco está descartado) nunca crean un segundo caso.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import UploadFile

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.events.bus import EventBus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.notify.context import LoteAdjudicadoContext
from app.notify.service import NotificationService
from app.postauction import media_storage
from app.postauction.events import PostAuctionCaseCreated, PostAuctionStatusChanged
from app.postauction.models import (
    PostAuctionCase,
    PostAuctionDocument,
    PostAuctionDocumentType,
    PostAuctionStatus,
    PostAuctionTimelineEntry,
)
from app.postauction.repository import PostAuctionRepository
from app.postauction.schemas import (
    PostAuctionCaseDetail,
    PostAuctionCaseRead,
    PostAuctionCaseRematadorDetail,
    PostAuctionCaseRematadorRead,
    PostAuctionDocumentRead,
    TimelineEntryRead,
)
from app.postauction.state_machine import STATUS_MILESTONE_FIELD, assert_transition_allowed

_STATUS_LABELS: dict[PostAuctionStatus, str] = {
    PostAuctionStatus.ADJUDICADO: "Adjudicado",
    PostAuctionStatus.PENDIENTE_CONTACTO: "Pendiente de contacto",
    PostAuctionStatus.PAGO_PENDIENTE: "Pago pendiente",
    PostAuctionStatus.PAGO_RECIBIDO: "Pago recibido",
    PostAuctionStatus.PREPARANDO_ENTREGA: "Preparando entrega",
    PostAuctionStatus.ENVIADO: "Enviado",
    PostAuctionStatus.ENTREGADO: "Entregado",
    PostAuctionStatus.FINALIZADO: "Finalizado",
}


class PostAuctionService:
    def __init__(
        self,
        repository: PostAuctionRepository,
        remate_repository: RemateRepository,
        lote_repository: LoteRepository,
        user_repository: UserRepository,
        audit_repository: AuditLogRepository,
        notification_repository: NotificationRepository,
        event_bus: EventBus,
        notification_service: NotificationService,
        settings: Settings,
    ) -> None:
        self._repository = repository
        self._remate_repository = remate_repository
        self._lote_repository = lote_repository
        self._user_repository = user_repository
        self._audit_repository = audit_repository
        self._notification_repository = notification_repository
        self._event_bus = event_bus
        self._notification_service = notification_service
        self._settings = settings

    # --- Creación automática (disparada por `realtime.py`, no por HTTP) -----------------

    async def create_case_from_winner(
        self,
        *,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        buyer_id: uuid.UUID,
        final_price: Decimal,
    ) -> PostAuctionCase | None:
        existing = await self._repository.get_by_lote_id(lote_id)
        if existing is not None:
            return existing

        remate = await self._remate_repository.get_by_id(remate_id)
        lote = await self._lote_repository.get_by_id(lote_id)
        buyer = await self._user_repository.get_by_id(buyer_id)
        if remate is None or lote is None or buyer is None:
            # Defensivo: el evento ya trae ids válidos en la práctica (los publica
            # `LoteService.auto_close` sobre entidades recién confirmadas), pero un
            # consumidor de fondo nunca debe reventar por una referencia que no resuelve.
            return None

        case = PostAuctionCase(
            lote_id=lote_id,
            remate_id=remate_id,
            buyer_id=buyer_id,
            rematador_id=remate.owner_id,
            final_price=final_price,
            status=PostAuctionStatus.ADJUDICADO,
        )
        self._repository.add_case(case)
        await self._repository.flush()

        self._audit_repository.record(
            actor_id=None,
            actor_name=None,
            actor_role=None,
            action=AuditAction.POSTAUCTION_CASE_CREATED,
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=remate_id,
            details={"lote_id": str(lote_id), "buyer_id": str(buyer_id)},
        )
        self._repository.add_timeline_entry(
            PostAuctionTimelineEntry(
                case_id=case.id,
                occurred_at=datetime.now(UTC),
                actor_id=None,
                actor_name=None,
                actor_role=None,
                action="case_created",
                previous_status=None,
                new_status=PostAuctionStatus.ADJUDICADO,
            )
        )

        rematador = await self._user_repository.get_by_id(remate.owner_id)
        self._notification_repository.create(
            user_id=buyer_id,
            type="postauction.case_created",
            title="¡Ganaste un lote!",
            message=(
                f"Ganaste el lote '{lote.title}' del remate '{remate.title}' por "
                f"${final_price}. El rematador se pondrá en contacto para coordinar el "
                "pago y la entrega."
            ),
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=remate_id,
        )
        if rematador is not None:
            self._notification_repository.create(
                user_id=rematador.id,
                type="postauction.case_created",
                title="Lote adjudicado",
                message=(
                    f"El lote '{lote.title}' del remate '{remate.title}' fue adjudicado "
                    f"a {buyer.full_name} por ${final_price}."
                ),
                resource_type="postauction_case",
                resource_id=case.id,
                remate_id=remate_id,
            )

        await self._repository.commit()
        await self._repository.refresh(case)
        await self._event_bus.publish(
            PostAuctionCaseCreated(
                remate_id=remate_id, case_id=case.id, lote_id=lote_id, buyer_id=buyer_id
            )
        )

        # Notificación al ganador (email hoy, WhatsApp después -- ver `app/notify/`).
        # Se dispara DESPUÉS del commit de arriba a propósito: la venta ya está
        # comprometida en este punto, así que ningún fallo de acá (SMTP caído, timeout,
        # credenciales mal configuradas) puede afectarla -- `NotificationService` nunca
        # lanza (mismo contrato que `EventBus.publish`), y el resultado por canal se
        # deja en el timeline del caso (reutilizando la tabla que ya existe, sin
        # necesidad de una tabla nueva) para poder diagnosticar o reintentar después.
        context = LoteAdjudicadoContext(
            case_id=case.id,
            lote_id=lote_id,
            remate_id=remate_id,
            buyer_email=buyer.email,
            buyer_name=buyer.full_name,
            buyer_phone=buyer.phone,
            rematador_id=remate.owner_id,
            rematador_name=rematador.full_name if rematador is not None else "El rematador",
            rematador_phone=rematador.phone if rematador is not None else None,
            remate_title=remate.title,
            lote_title=lote.title,
            lot_number=lote.lot_number,
            final_price=final_price,
            currency=remate.settings.get("currency", "ARS"),
            adjudicated_at=case.created_at,
        )
        results = await self._notification_service.notify_lote_adjudicado(context)
        for result in results:
            self._repository.add_timeline_entry(
                PostAuctionTimelineEntry(
                    case_id=case.id,
                    occurred_at=datetime.now(UTC),
                    actor_id=None,
                    actor_name=None,
                    actor_role=None,
                    action="notification_sent" if result.success else "notification_failed",
                    previous_status=None,
                    new_status=None,
                    details={"channel": result.channel, "notification_type": "lote_adjudicado"}
                    | ({"error": result.error} if result.error else {}),
                )
            )
        if results:
            await self._repository.commit()

        return case

    # --- Escritura (empresa dueña del caso, o admin) -------------------------------------

    async def change_status(
        self,
        case_id: uuid.UUID,
        actor: User,
        *,
        new_status: PostAuctionStatus,
        note: str | None,
        occurred_at: datetime | None,
    ) -> PostAuctionCase:
        case = await self._get_owned_case_or_raise(case_id, actor)
        assert_transition_allowed(case.status, new_status)
        previous_status = case.status

        case.status = new_status
        milestone_field = STATUS_MILESTONE_FIELD.get(new_status)
        timestamp = occurred_at or datetime.now(UTC)
        if milestone_field is not None and getattr(case, milestone_field) is None:
            setattr(case, milestone_field, timestamp)
        if note:
            case.notes = note

        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.POSTAUCTION_STATUS_CHANGED,
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=case.remate_id,
            details={"from": previous_status.value, "to": new_status.value},
        )
        self._repository.add_timeline_entry(
            PostAuctionTimelineEntry(
                case_id=case.id,
                occurred_at=datetime.now(UTC),
                actor_id=actor.id,
                actor_name=actor.full_name,
                actor_role=actor.role.value,
                action="status_changed",
                previous_status=previous_status,
                new_status=new_status,
                note=note,
            )
        )

        lote = await self._lote_repository.get_by_id(case.lote_id)
        lote_title = lote.title if lote is not None else "tu compra"
        self._notification_repository.create(
            user_id=case.buyer_id,
            type="postauction.status_changed",
            title=_notification_title(new_status),
            message=(
                f"El estado de tu compra del lote '{lote_title}' cambió a "
                f"'{_STATUS_LABELS[new_status]}'."
            ),
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=case.remate_id,
        )

        await self._repository.commit()
        await self._repository.refresh(case)
        await self._event_bus.publish(
            PostAuctionStatusChanged(
                remate_id=case.remate_id,
                case_id=case.id,
                lote_id=case.lote_id,
                previous_status=previous_status.value,
                new_status=new_status.value,
            )
        )
        return case

    async def add_note(self, case_id: uuid.UUID, actor: User, note: str) -> PostAuctionCase:
        case = await self._get_owned_case_or_raise(case_id, actor)
        case.notes = note

        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.POSTAUCTION_NOTE_ADDED,
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=case.remate_id,
        )
        self._repository.add_timeline_entry(
            PostAuctionTimelineEntry(
                case_id=case.id,
                occurred_at=datetime.now(UTC),
                actor_id=actor.id,
                actor_name=actor.full_name,
                actor_role=actor.role.value,
                action="note_added",
                previous_status=None,
                new_status=None,
                note=note,
            )
        )
        await self._repository.commit()
        await self._repository.refresh(case)
        return case

    async def upload_document(
        self,
        case_id: uuid.UUID,
        actor: User,
        *,
        document_type: PostAuctionDocumentType,
        upload: UploadFile,
        request_base_url: str,
    ) -> PostAuctionCase:
        """Adjunta un documento (comprobante, factura, guía de envío, etc.) a una venta
        adjudicada -- mismo control de ownership que `change_status`/`add_note` (empresa
        dueña del caso, o admin). El archivo se guarda en disco antes de tocar la base
        (`media_storage.save_postauction_document`); si la validación de Content-Type/
        tamaño falla, no queda ningún registro huérfano."""
        case = await self._get_owned_case_or_raise(case_id, actor)
        saved = await media_storage.save_postauction_document(
            case.id, upload, self._settings, request_base_url
        )

        document = PostAuctionDocument(
            case_id=case.id,
            document_type=document_type,
            filename=saved.filename,
            original_filename=upload.filename or saved.filename,
            content_type=upload.content_type or "application/octet-stream",
            file_size=saved.file_size,
            url=saved.url,
            uploaded_by_id=actor.id,
        )
        self._repository.add_document(document)

        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.POSTAUCTION_DOCUMENT_UPLOADED,
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=case.remate_id,
            details={"filename": document.original_filename, "document_type": document_type.value},
        )
        self._repository.add_timeline_entry(
            PostAuctionTimelineEntry(
                case_id=case.id,
                occurred_at=datetime.now(UTC),
                actor_id=actor.id,
                actor_name=actor.full_name,
                actor_role=actor.role.value,
                action="document_uploaded",
                previous_status=None,
                new_status=None,
                details={"filename": document.original_filename, "document_type": document_type.value},
            )
        )
        await self._repository.commit()
        await self._repository.refresh(case)
        return case

    async def delete_document(
        self, case_id: uuid.UUID, document_id: uuid.UUID, actor: User
    ) -> PostAuctionCase:
        case = await self._get_owned_case_or_raise(case_id, actor)
        document = await self._repository.get_document(case.id, document_id)
        if document is None:
            raise NotFoundError("Documento no encontrado.")

        filename, original_filename = document.filename, document.original_filename
        await self._repository.delete_document(document)

        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.POSTAUCTION_DOCUMENT_DELETED,
            resource_type="postauction_case",
            resource_id=case.id,
            remate_id=case.remate_id,
            details={"filename": original_filename},
        )
        self._repository.add_timeline_entry(
            PostAuctionTimelineEntry(
                case_id=case.id,
                occurred_at=datetime.now(UTC),
                actor_id=actor.id,
                actor_name=actor.full_name,
                actor_role=actor.role.value,
                action="document_deleted",
                previous_status=None,
                new_status=None,
                details={"filename": original_filename},
            )
        )
        await self._repository.commit()
        await self._repository.refresh(case)
        media_storage.delete_postauction_document_file(case.id, filename, self._settings)
        return case

    # --- Lectura -------------------------------------------------------------------------

    async def list_for_rematador(
        self,
        viewer: User,
        *,
        status: PostAuctionStatus | None,
        remate_id: uuid.UUID | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[PostAuctionCaseRematadorRead], int]:
        if viewer.role not in (UserRole.EMPRESA, UserRole.ADMIN):
            raise ForbiddenError(
                "Solo una empresa o un administrador pueden ver ventas adjudicadas."
            )
        offset = (page - 1) * page_size
        cases, total = await self._repository.list_for_rematador(
            rematador_id=viewer.id,
            status=status,
            remate_id=remate_id,
            search=search,
            offset=offset,
            limit=page_size,
        )
        return [await self._build_rematador_read(case) for case in cases], total

    async def list_for_buyer(
        self,
        viewer: User,
        *,
        status: PostAuctionStatus | None,
        search: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[PostAuctionCaseRead], int]:
        offset = (page - 1) * page_size
        cases, total = await self._repository.list_for_buyer(
            buyer_id=viewer.id, status=status, search=search, offset=offset, limit=page_size
        )
        return await self._to_read_list(cases), total

    async def get_detail_for_rematador(
        self, case_id: uuid.UUID, viewer: User
    ) -> PostAuctionCaseRematadorDetail:
        case = await self._get_owned_case_or_raise(case_id, viewer)
        return await self._to_rematador_detail(case)

    async def get_detail_for_buyer(
        self, case_id: uuid.UUID, viewer: User
    ) -> PostAuctionCaseDetail:
        case = await self._repository.get_by_id(case_id)
        if case is None or (viewer.role != UserRole.ADMIN and case.buyer_id != viewer.id):
            raise NotFoundError("Compra no encontrada.")
        return await self._to_detail(case)

    # --- Compartido ------------------------------------------------------------------

    async def _get_owned_case_or_raise(
        self, case_id: uuid.UUID, actor: User
    ) -> PostAuctionCase:
        case = await self._repository.get_by_id(case_id)
        if case is None:
            raise NotFoundError("Venta adjudicada no encontrada.")
        if actor.role != UserRole.ADMIN and case.rematador_id != actor.id:
            raise ForbiddenError(
                "Solo el rematador dueño de esta venta (o un administrador) puede "
                "gestionarla."
            )
        return case

    async def _to_read_list(self, cases: list[PostAuctionCase]) -> list[PostAuctionCaseRead]:
        return [(await self._build_read_and_buyer(case))[0] for case in cases]

    async def _build_read(self, case: PostAuctionCase) -> PostAuctionCaseRead:
        read, _buyer = await self._build_read_and_buyer(case)
        return read

    async def _build_read_and_buyer(
        self, case: PostAuctionCase
    ) -> tuple[PostAuctionCaseRead, User | None]:
        lote = await self._lote_repository.get_by_id(case.lote_id)
        remate = await self._remate_repository.get_by_id(case.remate_id)
        buyer = await self._user_repository.get_by_id(case.buyer_id)
        rematador = await self._user_repository.get_by_id(case.rematador_id)
        lote_images = sorted(lote.images, key=lambda image: image.get("order", 0)) if lote else []
        read = PostAuctionCaseRead(
            id=case.id,
            lote_id=case.lote_id,
            lot_number=lote.lot_number if lote else "",
            lote_title=lote.title if lote else "",
            lote_cover_image_url=lote_images[0]["url"] if lote_images else None,
            remate_id=case.remate_id,
            remate_title=remate.title if remate else "",
            buyer_id=case.buyer_id,
            buyer_name=buyer.full_name if buyer else None,
            rematador_id=case.rematador_id,
            rematador_name=rematador.full_name if rematador else None,
            base_price=lote.base_price if lote else None,
            final_price=case.final_price,
            status=case.status,
            contacted_at=case.contacted_at,
            payment_at=case.payment_at,
            shipped_at=case.shipped_at,
            delivered_at=case.delivered_at,
            finalized_at=case.finalized_at,
            notes=case.notes,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )
        return read, buyer

    async def _build_rematador_read(self, case: PostAuctionCase) -> PostAuctionCaseRematadorRead:
        read, buyer = await self._build_read_and_buyer(case)
        return PostAuctionCaseRematadorRead(
            **read.model_dump(),
            buyer_email=buyer.email if buyer else None,
            buyer_phone=buyer.phone if buyer else None,
        )

    async def _to_detail(self, case: PostAuctionCase) -> PostAuctionCaseDetail:
        read = await self._build_read(case)
        timeline = await self._repository.list_timeline(case.id)
        documents = await self._repository.list_documents(case.id)
        return PostAuctionCaseDetail(
            **read.model_dump(),
            timeline=[TimelineEntryRead.model_validate(entry) for entry in timeline],
            documents=[PostAuctionDocumentRead.model_validate(doc) for doc in documents],
        )

    async def _to_rematador_detail(self, case: PostAuctionCase) -> PostAuctionCaseRematadorDetail:
        read = await self._build_rematador_read(case)
        timeline = await self._repository.list_timeline(case.id)
        documents = await self._repository.list_documents(case.id)
        return PostAuctionCaseRematadorDetail(
            **read.model_dump(),
            timeline=[TimelineEntryRead.model_validate(entry) for entry in timeline],
            documents=[PostAuctionDocumentRead.model_validate(doc) for doc in documents],
        )


def _notification_title(new_status: PostAuctionStatus) -> str:
    if new_status == PostAuctionStatus.PAGO_RECIBIDO:
        return "Pago registrado"
    if new_status == PostAuctionStatus.ENTREGADO:
        return "Entrega confirmada"
    return "Actualización de tu compra"
