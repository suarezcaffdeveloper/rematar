"""Lógica de negocio de Remate.

## Alcance (Módulo 2.1 + Módulo 2.3)

Transiciones de estado implementadas: `create` (-> DRAFT), `schedule` (DRAFT ->
SCHEDULED), `cancel` (cualquier estado no terminal -> CANCELLED) desde el Módulo 2.1;
`start` (SCHEDULED -> LIVE, valida RF-08), `pause`/`resume` (LIVE <-> PAUSED) y `finish`
(LIVE -> FINISHED, valida que no haya un lote OPEN) desde el Módulo 2.3 — ver
docs/16-motor-de-estados.md. `state_machine.py` no cambió: ya modelaba las seis
transiciones completas desde el Módulo 2.1, este módulo solo agregó los métodos de
servicio que faltaban, tal como esa fase anticipaba.

`finish` es, desde el Módulo de lotes desiertos, la ÚNICA vía de finalización: ya no
existe ninguna finalización automática al resolverse el último lote (RF-10/ADR-019
quedan sin efecto, ver `app/modules/remates/lotes/service.py`) -- el rematador decide
siempre explícitamente cuándo terminar, incluso con lotes desiertos pendientes de
reincorporar.

## Eventos de dominio (Épica 3, Módulo 3.2)

Cada transición publica su evento correspondiente (`app/modules/remates/events.py`) a
través de `EventBus`, siempre como última instrucción, después de confirmar la
transacción — ver docs/19-arquitectura-de-eventos.md y ADR-022. Es el único cambio de
esta fase: ninguna validación ni regla de negocio de las descriptas arriba se modificó.

## Auditoría (Épica 7, Módulo 7.2)

`create`, `update` (`remate.updated`/`remate.settings_changed` según si `settings`
cambió), `soft_delete` y las seis transiciones de estado (`remate.status_changed`)
dejan constancia vía `AuditLogRepository.record` (ver docs/36 y ADR-039), **antes** del
`commit()` que ya existe en cada método -- misma transacción, nunca vía el Event Bus
(best-effort, podría perderse).

## Permisos (ver docs/14-modulo-remate.md y ADR-047/ADR-048 para el detalle completo)

- Crear: solo rol `empresa` (aplicado en el router vía `require_roles`).
- Ver: dueño y admin ven cualquier estado; cualquier otro usuario solo ve remates que no
  estén en `DRAFT`. Un borrador ajeno devuelve 404, no 403 — no se confirma su
  existencia a quien no debería ni saber que existe.
- Crear/programar/cancelar/iniciar/editar/eliminar/gestionar lotes y postventa:
  exclusivamente la empresa dueña (`get_owned_or_raise`). El admin puede *ver* todo pero
  no puede escribir — así lo pide el enunciado de este módulo.
- Pausar/reanudar/finalizar (acciones de la Consola Operativa en vivo): la empresa dueña
  **o** el rematador asignado como operador (`get_operator_or_raise`, ver ADR-048). La
  empresa nunca pierde la capacidad de operar su propio remate.

## Asignación de operador (ADR-048)

Una empresa genera un código de un solo hash (`generate_operator_code`) que comparte
fuera de banda con un usuario `rematador`; ese rematador lo canjea (`claim_operator`)
para quedar asignado como `Remate.rematador_id`. Regenerar el código revoca al operador
anterior en la misma operación. El código nunca se persiste en texto plano.

Un rematador solo puede tener un remate activo (no `finished`/`cancelled`) asignado a la
vez -- `claim_operator` rechaza el canje si ya está operando otro (ver
`RemateRepository.get_active_operator_assignment`). Sostiene el panel "mi remate actual"
del Home del rematador (Fase 1): al ser 1:1, alcanza con pedir
`GET /remates?rematador_id=<mi_id>` y esperar a lo sumo un resultado activo.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import UploadFile

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError, RateLimitError
from app.events.bus import EventBus
from app.modules.remates import media_storage
from app.modules.remates.events import (
    RemateCancelled,
    RemateCreated,
    RemateFinished,
    RematePaused,
    RemateResumed,
    RemateScheduled,
    RemateStarted,
)
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import (
    Remate,
    RemateAccessGrant,
    RemateAccessType,
    RemateCategory,
    RemateStatus,
)
from app.modules.remates.repository import RemateRepository
from app.modules.remates.schemas import RemateCreate, RemateUpdate
from app.modules.remates.state_machine import assert_transition_allowed
from app.modules.users.models import User, UserRole
from app.redis.rate_limit import RedisRateLimiter

# Sin 0/O/1/I (ambiguos al leerlos/tipearlos en voz alta el día del remate). No es un
# secreto de alto valor sujeto a fuerza bruta offline -- por eso alcanza un hash rápido
# (sha256) en vez de algo tipo argon2, a diferencia de una contraseña.
_OPERATOR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_OPERATOR_CODE_LENGTH = 8

# Mismo alfabeto que operator_code (sin 0/O/1/I). Un poco más largo (10 vs 8): este
# código se comparte por canales externos (WhatsApp, email) elegidos por la empresa, más
# superficie de exposición que operator_code (que la empresa entrega directo a un
# rematador puntual) -- igual sigue siendo un secreto de bajo valor, no sujeto a fuerza
# bruta offline (por eso alcanza cifrado simétrico reversible en vez de algo tipo
# argon2; ver `private_access_code_encrypted` en models.py sobre por qué reversible y no
# hasheado, a diferencia de operator_code_hash).
_PRIVATE_ACCESS_CODE_ALPHABET = _OPERATOR_CODE_ALPHABET
_PRIVATE_ACCESS_CODE_LENGTH = 10


def _hash_operator_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def _normalize_private_access_code(code: str) -> str:
    return code.strip().upper()


class RemateService:
    def __init__(
        self,
        repository: RemateRepository,
        lote_repository: LoteRepository,
        event_bus: EventBus,
        audit_repository: AuditLogRepository,
        rate_limiter: RedisRateLimiter | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._repository = repository
        self._lote_repository = lote_repository
        self._event_bus = event_bus
        self._audit_repository = audit_repository
        # Opcionales: RemateService se instancia directo (sin pasar por
        # get_remate_service) en una docena de lugares (snapshot, moderación, chat,
        # bots, timer, tests) que nunca ejercitan el flujo de remates privados --
        # exigirlos como parámetros obligatorios forzaría tocar todos esos call sites
        # solo para satisfacer una firma que no necesitan. Solo get_remate_service
        # (dependencies.py) los inyecta de verdad; redeem_private_access salta el rate
        # limit si faltan (nunca pasa a través del router real, que sí los provee).
        # `settings` además provee SECRET_KEY, usado para cifrar/descifrar
        # private_access_code_encrypted (create, generate_private_access_code,
        # get_private_access_code, redeem_private_access) -- ninguno de esos métodos se
        # ejercita fuera del router real, mismo criterio que el rate limiter.
        self._rate_limiter = rate_limiter
        self._settings = settings

    def _record_status_change(
        self, remate: Remate, actor: User | None, previous_status: RemateStatus, *, trigger: str
    ) -> None:
        self._audit_repository.record(
            actor_id=actor.id if actor else None,
            actor_name=actor.full_name if actor else None,
            actor_role=actor.role.value if actor else None,
            action=AuditAction.REMATE_STATUS_CHANGED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"from": previous_status.value, "to": remate.status.value, "trigger": trigger},
        )

    async def create(self, owner: User, data: RemateCreate) -> tuple[Remate, str | None]:
        remate = Remate(
            owner_id=owner.id,
            title=data.title,
            category=data.category,
            description=data.description,
            cover_image_url=str(data.cover_image_url) if data.cover_image_url else None,
            location=data.location,
            starts_at=data.starts_at,
            ends_at=data.ends_at,
            settings=data.settings.model_dump(),
            access_type=data.access_type,
        )
        # Si el remate nace privado, el código se genera de una: el requisito es que la
        # empresa lo tenga disponible apenas crea el remate, sin un segundo paso manual
        # (ver PrivateAccessPanel en el frontend, que lo pre-carga desde esta respuesta).
        code: str | None = None
        if data.access_type == RemateAccessType.PRIVATE:
            code = "".join(
                secrets.choice(_PRIVATE_ACCESS_CODE_ALPHABET)
                for _ in range(_PRIVATE_ACCESS_CODE_LENGTH)
            )
            normalized = _normalize_private_access_code(code)
            remate.private_access_code_encrypted = encrypt_secret(
                normalized, self._settings.SECRET_KEY
            )
            remate.private_access_code_generated_at = datetime.now(UTC)
        self._repository.add(remate)
        # `remate.id` es un default client-side (`uuid.uuid4`, ver `db/mixins.py`) --
        # flush lo asigna sin comitear, para poder usarlo como resource_id/remate_id de
        # la entrada de auditoría y dejarla en el mismo commit único de abajo.
        await self._audit_repository.flush()
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_CREATED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"title": remate.title, "category": remate.category.value},
        )
        if code is not None:
            self._audit_repository.record(
                actor_id=owner.id,
                actor_name=owner.full_name,
                actor_role=owner.role.value,
                action=AuditAction.REMATE_PRIVATE_ACCESS_CODE_GENERATED,
                resource_type="remate",
                resource_id=remate.id,
                remate_id=remate.id,
            )
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(
            RemateCreated(
                remate_id=remate.id,
                owner_id=remate.owner_id,
                title=remate.title,
                category=remate.category,
            )
        )
        return remate, code

    async def upload_cover_image(
        self, owner: User, upload: UploadFile, settings: Settings, request_base_url: str
    ) -> str:
        """Sube la imagen de portada de un remate (refinamiento visual: reemplaza el
        campo de URL manual por selección de archivo, `RemateFormModal`). Sin scope a
        un `remate_id` -- se llama desde el mismo formulario que crea el remate, antes
        de que exista ninguna fila (`media_storage.save_remate_cover_image` namespacea
        por `owner_id`, no por `remate_id`, justamente por esto). No hay ownership de un
        remate puntual que validar acá; el único control de acceso es el rol
        `rematador`, ya exigido por `require_roles` en el router. No toca ninguna fila:
        devuelve solo la URL, igual que `LoteService.upload_image`."""
        return await media_storage.save_remate_cover_image(
            owner.id, upload, settings, request_base_url
        )

    @staticmethod
    def _is_visible(remate: Remate, viewer: User | None) -> bool:
        # Visitante anónimo (ADR-049): mismo trato que "cualquier otro usuario que no es
        # dueño ni admin" -- ve cualquier remate que no esté en DRAFT. Nunca puede ser
        # dueño ni admin, así que alcanza con saltear esas dos ramas.
        if viewer is None:
            return remate.status != RemateStatus.DRAFT
        if viewer.role == UserRole.ADMIN:
            return True
        if remate.owner_id == viewer.id:
            return True
        # Mismo criterio que el dueño para el rematador asignado como operador (ADR-048)
        # -- la empresa puede generar el código desde `draft` (ver `OperatorCodePanel`),
        # así que un rematador recién asignado tiene que poder ver ESE remate aunque
        # siga en borrador. Mismo ajuste que `RemateRepository.list_for_viewer`.
        if remate.rematador_id == viewer.id:
            return True
        # Un PRIVATE nunca es visible por la rama genérica de abajo -- la única vía
        # adicional es un RemateAccessGrant, chequeado en get_visible_or_raise (requiere
        # una consulta async, que este método estático no puede hacer).
        if remate.access_type == RemateAccessType.PRIVATE:
            return False
        return remate.status != RemateStatus.DRAFT

    async def get_visible_or_raise(self, remate_id: uuid.UUID, viewer: User | None) -> Remate:
        remate = await self._repository.get_by_id(remate_id)
        if remate is None:
            raise NotFoundError("Remate no encontrado.")
        if self._is_visible(remate, viewer):
            return remate
        # Único caso adicional a _is_visible: un comprador con un grant vigente para
        # este remate PRIVATE puntual. Mismo NotFoundError genérico en cualquier otro
        # caso (id inexistente, borrador ajeno, privado sin grant) -- anti-enumeración,
        # nunca se distingue "no existe" de "existe pero no tenés acceso".
        if (
            remate.access_type == RemateAccessType.PRIVATE
            and viewer is not None
            and await self._repository.get_access_grant(remate_id, viewer.id) is not None
        ):
            return remate
        raise NotFoundError("Remate no encontrado.")

    async def list_private_access_granted(self, user: User) -> list[Remate]:
        """Remates privados a los que `user` ya canjeó el código alguna vez -- vista de
        autoservicio de "Ingresar a remate privado" (`RedeemPrivateAccessPage`), no el
        listado general (`list_for_viewer`, que nunca muestra un PRIVATE). Sin chequeo
        de rol adicional: un grant solo existe para quien canjeó un código siendo
        `comprador` (`redeem_private_access` exige ese rol en el router), alcanza con
        estar autenticado para consultar los propios."""
        return await self._repository.list_granted_for_user(user.id)

    async def get_owned_or_raise(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_visible_or_raise(remate_id, owner)
        if remate.owner_id != owner.id:
            raise ForbiddenError("Solo el propietario puede modificar este remate.")
        return remate

    async def get_operator_or_raise(self, remate_id: uuid.UUID, actor: User) -> Remate:
        """Como `get_owned_or_raise`, pero también admite al rematador asignado como
        operador (`Remate.rematador_id`) -- para las acciones de la Consola Operativa en
        vivo que el árbitro puede ejecutar sin ser dueño del remate (ADR-048)."""
        remate = await self.get_visible_or_raise(remate_id, actor)
        if remate.owner_id != actor.id and remate.rematador_id != actor.id:
            raise ForbiddenError(
                "Solo el propietario o el rematador asignado pueden operar este remate."
            )
        return remate

    async def generate_operator_code(self, remate_id: uuid.UUID, owner: User) -> tuple[Remate, str]:
        """Genera (o regenera) el código que la empresa comparte con un rematador para
        que pueda operar este remate en vivo. Regenerar revoca al operador actual
        (limpia `rematador_id`) en la misma operación, para no dejar una ventana en la
        que dos códigos distintos sirvan a la vez."""
        remate = await self.get_owned_or_raise(remate_id, owner)
        code = "".join(secrets.choice(_OPERATOR_CODE_ALPHABET) for _ in range(_OPERATOR_CODE_LENGTH))
        remate.operator_code_hash = _hash_operator_code(code)
        remate.operator_code_generated_at = datetime.now(UTC)
        remate.rematador_id = None
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_OPERATOR_CODE_GENERATED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate, code

    async def claim_operator(self, remate_id: uuid.UUID, rematador: User, code: str) -> Remate:
        """Un usuario `rematador` canjea el código que le dio la empresa para quedar
        asignado como operador de este remate. Busca por id directo, sin pasar por
        `get_visible_or_raise`: el código en sí es la credencial (mismo criterio que un
        token de reset de contraseña) -- un rematador no necesita visibilidad previa del
        remate para reclamarlo con un código válido."""
        remate = await self._repository.get_by_id(remate_id)
        if remate is None or remate.operator_code_hash is None:
            raise NotFoundError("Remate no encontrado o sin código de operador generado.")
        if not secrets.compare_digest(remate.operator_code_hash, _hash_operator_code(code)):
            raise ForbiddenError("Código de operador inválido.")

        # Un rematador solo puede operar un remate a la vez (panel "mi remate actual",
        # Fase 1) -- sin este chequeo, nada le impedía canjear códigos de varios remates
        # en simultáneo. Reclamar el mismo remate de nuevo (ej. después de que la empresa
        # regeneró el código para el mismo operador) no cuenta como conflicto.
        existing_assignment = await self._repository.get_active_operator_assignment(rematador.id)
        if existing_assignment is not None and existing_assignment.id != remate.id:
            raise BusinessRuleError(
                "Ya estás operando otro remate. Salí de esa consola antes de unirte a uno nuevo.",
                current_remate_id=str(existing_assignment.id),
            )

        remate.rematador_id = rematador.id
        self._audit_repository.record(
            actor_id=rematador.id,
            actor_name=rematador.full_name,
            actor_role=rematador.role.value,
            action=AuditAction.REMATE_OPERATOR_CLAIMED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

    async def generate_private_access_code(
        self, remate_id: uuid.UUID, owner: User
    ) -> tuple[Remate, str]:
        """Genera (o regenera) el código de acceso de un remate privado. A diferencia de
        `generate_operator_code`, regenerar NO revoca nada: el código es un canal de
        invitación compartido por varios compradores, no una asignación 1:1 -- los
        `RemateAccessGrant` ya otorgados con el código anterior siguen valiendo."""
        remate = await self.get_owned_or_raise(remate_id, owner)
        if remate.access_type != RemateAccessType.PRIVATE:
            raise BusinessRuleError(
                "Este remate no es privado; no se puede generar un código de acceso."
            )
        code = "".join(
            secrets.choice(_PRIVATE_ACCESS_CODE_ALPHABET)
            for _ in range(_PRIVATE_ACCESS_CODE_LENGTH)
        )
        remate.private_access_code_encrypted = encrypt_secret(
            _normalize_private_access_code(code), self._settings.SECRET_KEY
        )
        remate.private_access_code_generated_at = datetime.now(UTC)
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_PRIVATE_ACCESS_CODE_GENERATED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate, code

    async def get_private_access_code(
        self, remate_id: uuid.UUID, owner: User
    ) -> tuple[Remate, str] | None:
        """Devuelve el código de acceso ACTUAL de un remate privado, sin regenerarlo --
        a diferencia de `generate_private_access_code`, es una operación de solo
        lectura (sin entrada de auditoría: no cambia nada). Es lo que permite mostrar el
        mismo código en la card del dashboard y en la Consola Operativa sin que cada
        vista tenga que invalidar la anterior. `None` si el remate es privado pero
        todavía no tiene código generado (no debería pasar para remates creados después
        de este cambio, ya que `create` siempre genera uno; puede pasar para datos
        preexistentes)."""
        remate = await self.get_owned_or_raise(remate_id, owner)
        if remate.access_type != RemateAccessType.PRIVATE:
            raise BusinessRuleError(
                "Este remate no es privado; no tiene código de acceso."
            )
        if remate.private_access_code_encrypted is None:
            return None
        code = decrypt_secret(remate.private_access_code_encrypted, self._settings.SECRET_KEY)
        return remate, code

    async def redeem_private_access(
        self, remate_id: uuid.UUID, comprador: User, code: str
    ) -> Remate:
        """Un `comprador` canjea el código de acceso de un remate privado para quedar
        con acceso persistente (`RemateAccessGrant`) a ESE remate puntual. Busca por id
        directo, sin pasar por `get_visible_or_raise` (mismo criterio que
        `claim_operator`: el código es la credencial). Cualquier fallo -- remate
        inexistente, no privado, sin código generado, código incorrecto -- da el mismo
        `NotFoundError` genérico: nunca se filtra por qué falló (anti-enumeración, mismo
        criterio que `get_visible_or_raise`)."""
        if self._rate_limiter is not None and self._settings is not None:
            allowed = await self._rate_limiter.check_and_increment(
                f"private_access_redeem:{comprador.id}",
                limit=self._settings.PRIVATE_ACCESS_REDEEM_RATE_LIMIT_MAX_ATTEMPTS,
                window_seconds=self._settings.PRIVATE_ACCESS_REDEEM_RATE_LIMIT_WINDOW_SECONDS,
            )
            if not allowed:
                raise RateLimitError(
                    "Demasiados intentos. Esperá unos minutos antes de volver a intentar."
                )

        remate = await self._repository.get_by_id(remate_id)
        if (
            remate is None
            or remate.access_type != RemateAccessType.PRIVATE
            or remate.private_access_code_encrypted is None
        ):
            raise NotFoundError("Remate no encontrado o código inválido.")
        stored_code = decrypt_secret(
            remate.private_access_code_encrypted, self._settings.SECRET_KEY
        )
        if not secrets.compare_digest(stored_code, _normalize_private_access_code(code)):
            raise NotFoundError("Remate no encontrado o código inválido.")

        existing_grant = await self._repository.get_access_grant(remate.id, comprador.id)
        if existing_grant is None:
            self._repository.add_access_grant(
                RemateAccessGrant(remate_id=remate.id, user_id=comprador.id)
            )
            self._audit_repository.record(
                actor_id=comprador.id,
                actor_name=comprador.full_name,
                actor_role=comprador.role.value,
                action=AuditAction.REMATE_PRIVATE_ACCESS_REDEEMED,
                resource_type="remate",
                resource_id=remate.id,
                remate_id=remate.id,
            )
            await self._repository.commit()
            await self._repository.refresh(remate)
        return remate

    async def list_for_viewer(
        self,
        *,
        viewer: User | None,
        page: int,
        page_size: int,
        category: RemateCategory | None = None,
        status: RemateStatus | None = None,
        owner_id: uuid.UUID | None = None,
        rematador_id: uuid.UUID | None = None,
    ) -> tuple[list[Remate], int]:
        offset = (page - 1) * page_size
        return await self._repository.list_for_viewer(
            viewer=viewer,
            offset=offset,
            limit=page_size,
            category=category,
            status=status,
            owner_id=owner_id,
            rematador_id=rematador_id,
        )

    async def update(self, remate_id: uuid.UUID, owner: User, data: RemateUpdate) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        if remate.status not in (RemateStatus.DRAFT, RemateStatus.SCHEDULED):
            raise BusinessRuleError(
                "Solo se puede editar un remate en borrador o programado.",
                current_status=remate.status.value,
            )

        changes = data.model_dump(exclude_unset=True)
        if changes.get("cover_image_url") is not None:
            changes["cover_image_url"] = str(changes["cover_image_url"])

        starts_at = changes.get("starts_at", remate.starts_at)
        ends_at = changes.get("ends_at", remate.ends_at)
        if starts_at and ends_at and ends_at <= starts_at:
            raise BusinessRuleError("La fecha de finalización debe ser posterior a la de inicio.")

        for field, value in changes.items():
            setattr(remate, field, value)

        audit_action = (
            AuditAction.REMATE_SETTINGS_CHANGED
            if "settings" in changes
            else AuditAction.REMATE_UPDATED
        )
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=audit_action,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={"changed_fields": sorted(changes.keys())},
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        return remate

    async def schedule(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.SCHEDULED)
        previous_status = remate.status

        if remate.starts_at is None:
            raise BusinessRuleError(
                "Para programar el remate hace falta definir la fecha y hora de inicio."
            )
        if remate.starts_at <= datetime.now(UTC):
            raise BusinessRuleError("La fecha de inicio debe ser futura.")

        remate.status = RemateStatus.SCHEDULED
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(
            RemateScheduled(remate_id=remate.id, starts_at=remate.starts_at)
        )
        return remate

    async def cancel(self, remate_id: uuid.UUID, owner: User, reason: str) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.CANCELLED)
        previous_status = remate.status

        remate.status = RemateStatus.CANCELLED
        remate.cancellation_reason = reason
        remate.cancelled_at = datetime.now(UTC)

        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_STATUS_CHANGED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
            details={
                "from": previous_status.value,
                "to": remate.status.value,
                "trigger": "manual",
                "reason": reason,
            },
        )
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateCancelled(remate_id=remate.id, reason=reason))
        return remate

    async def soft_delete(self, remate_id: uuid.UUID, owner: User) -> None:
        remate = await self.get_owned_or_raise(remate_id, owner)
        # DRAFT: nunca llegó a publicarse, no hay nada que auditar más allá de su
        # creación. CANCELLED: ya es terminal y su cancelación (motivo, fecha) quedó
        # asentada en `AuditLogRepository` en su momento -- borrar el remate en sí no
        # hace desaparecer ese registro de auditoría, ver `docs/36`. Deliberadamente
        # NO incluye FINISHED: ese estado sí tiene resultados de venta reales (quién
        # ganó cada lote, a qué precio) que dependen de poder resolver el remate por id
        # (`HistoryService._get_finished_remate_or_raise`, vía
        # `RemateRepository.get_by_id`, que ya filtra `deleted_at`) -- eliminarlo dejaría
        # "Ver resumen" con un 404 permanente, sin ninguna vía de la interfaz para
        # deshacerlo. Para un remate finalizado que ya no hace falta ver, no hay
        # operación equivalente hoy (decisión de producto, no una limitación técnica).
        if remate.status not in (RemateStatus.DRAFT, RemateStatus.CANCELLED):
            raise BusinessRuleError(
                "Solo se puede eliminar un remate en borrador o cancelado; para uno "
                "programado o en curso, cancelalo primero (conserva el motivo para "
                "auditoría).",
                current_status=remate.status.value,
            )
        remate.deleted_at = datetime.now(UTC)
        self._audit_repository.record(
            actor_id=owner.id,
            actor_name=owner.full_name,
            actor_role=owner.role.value,
            action=AuditAction.REMATE_DELETED,
            resource_type="remate",
            resource_id=remate.id,
            remate_id=remate.id,
        )
        await self._repository.commit()

    async def start(self, remate_id: uuid.UUID, owner: User) -> Remate:
        remate = await self.get_owned_or_raise(remate_id, owner)
        assert_transition_allowed(remate.status, RemateStatus.LIVE)
        previous_status = remate.status

        if await self._lote_repository.count_by_remate(remate_id) == 0:
            raise BusinessRuleError(
                "Un remate no puede iniciarse sin al menos un lote cargado (RF-08)."
            )

        remate.status = RemateStatus.LIVE
        self._record_status_change(remate, owner, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateStarted(remate_id=remate.id))
        return remate

    async def pause(self, remate_id: uuid.UUID, actor: User) -> Remate:
        remate = await self.get_operator_or_raise(remate_id, actor)
        assert_transition_allowed(remate.status, RemateStatus.PAUSED)
        previous_status = remate.status

        remate.status = RemateStatus.PAUSED
        self._record_status_change(remate, actor, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RematePaused(remate_id=remate.id))
        return remate

    async def resume(self, remate_id: uuid.UUID, actor: User) -> Remate:
        remate = await self.get_operator_or_raise(remate_id, actor)
        assert_transition_allowed(remate.status, RemateStatus.LIVE)
        previous_status = remate.status

        remate.status = RemateStatus.LIVE
        self._record_status_change(remate, actor, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateResumed(remate_id=remate.id))
        return remate

    async def finish(self, remate_id: uuid.UUID, actor: User) -> Remate:
        remate = await self.get_operator_or_raise(remate_id, actor)
        assert_transition_allowed(remate.status, RemateStatus.FINISHED)
        previous_status = remate.status

        if await self._lote_repository.has_open_lote(remate_id):
            raise BusinessRuleError(
                "No se puede finalizar el remate mientras haya un lote abierto."
            )

        remate.status = RemateStatus.FINISHED
        remate.finished_at = datetime.now(UTC)
        self._record_status_change(remate, actor, previous_status, trigger="manual")
        await self._repository.commit()
        await self._repository.refresh(remate)
        await self._event_bus.publish(RemateFinished(remate_id=remate.id, triggered_by="manual"))
        return remate
