"""Acceso a datos del módulo de remates.

`list_for_viewer` codifica la regla de visibilidad (docs/14-modulo-remate.md) como una
cláusula SQL, no como un filtro en Python después de traer todo: con la escala pensada en
Fase 0 (RNF-04, cientos/miles de remates eventualmente) filtrar en el cliente sería tanto
incorrecto para la paginación (`total` quedaría mal) como lento.
"""

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.models import (
    Remate,
    RemateAccessGrant,
    RemateAccessType,
    RemateCategory,
    RemateStatus,
)
from app.modules.users.models import User, UserRole


class RemateRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, remate_id: uuid.UUID) -> Remate | None:
        remate = await self._db.get(Remate, remate_id)
        if remate is not None and remate.deleted_at is not None:
            return None
        return remate

    async def list_for_viewer(
        self,
        *,
        viewer: User | None,
        offset: int,
        limit: int,
        category: RemateCategory | None = None,
        status: RemateStatus | None = None,
        owner_id: uuid.UUID | None = None,
        rematador_id: uuid.UUID | None = None,
    ) -> tuple[list[Remate], int]:
        stmt = select(Remate).where(Remate.deleted_at.is_(None))

        if viewer is None:
            # Visitante anónimo (ADR-049): nunca ve borradores, no tiene remates
            # "propios" que ver en cualquier estado. Tampoco ve remates PRIVATE -- un
            # anónimo nunca puede tener un grant (RemateAccessGrant exige un user_id).
            stmt = stmt.where(
                Remate.access_type == RemateAccessType.PUBLIC,
                Remate.status != RemateStatus.DRAFT,
            )
        elif viewer.role != UserRole.ADMIN:
            # Ve sus propios remates en cualquier estado, los que tiene asignados como
            # operador en cualquier estado (la empresa puede generar el código de
            # operador desde `draft`, ver `OperatorCodePanel`, así que un rematador
            # recién asignado tiene que poder ver ESE remate aunque siga en borrador), y
            # los PUBLIC de cualquiera mientras no estén en borrador. Ver
            # docs/14-modulo-remate.md, sección "Visibilidad".
            #
            # A propósito NO se consulta RemateAccessGrant acá: un remate PRIVATE nunca
            # aparece en "remates disponibles" (este listado general), ni siquiera para
            # alguien que ya canjeó su código -- el grant solo habilita el detalle/sala
            # puntual (RemateService.get_visible_or_raise) y la vista de autoservicio
            # separada `list_granted_for_user` ("Ingresar a remate privado"), nunca ESTE
            # listado.
            stmt = stmt.where(
                or_(
                    Remate.owner_id == viewer.id,
                    Remate.rematador_id == viewer.id,
                    and_(
                        Remate.access_type == RemateAccessType.PUBLIC,
                        Remate.status != RemateStatus.DRAFT,
                    ),
                )
            )

        if category is not None:
            stmt = stmt.where(Remate.category == category)
        if status is not None:
            stmt = stmt.where(Remate.status == status)
        if owner_id is not None:
            stmt = stmt.where(Remate.owner_id == owner_id)
        if rematador_id is not None:
            # "Mi remate actual" del rematador (panel de rol, Fase 1) -- combinado con el
            # `Remate.rematador_id == viewer.id` de la cláusula de visibilidad de arriba,
            # un rematador consultando su propio id nunca se queda sin ver el remate que
            # tiene asignado, sea cual sea su estado.
            stmt = stmt.where(Remate.rematador_id == rematador_id)

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Remate.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    async def get_active_operator_assignment(self, rematador_id: uuid.UUID) -> Remate | None:
        """El remate (si hay alguno) donde `rematador_id` es el operador asignado y que
        todavía no terminó -- usado para la regla de "un rematador solo puede operar un
        remate a la vez" en `RemateService.claim_operator`. `finished`/`cancelled` no
        cuentan como activos: un remate ya terminado no bloquea aceptar un código nuevo,
        aunque `Remate.rematador_id` no se limpie solo al llegar a esos estados."""
        stmt = select(Remate).where(
            Remate.deleted_at.is_(None),
            Remate.rematador_id == rematador_id,
            Remate.status.notin_([RemateStatus.FINISHED, RemateStatus.CANCELLED]),
        )
        result = await self._db.execute(stmt)
        return result.scalars().first()

    async def get_access_grant(
        self, remate_id: uuid.UUID, user_id: uuid.UUID
    ) -> RemateAccessGrant | None:
        stmt = select(RemateAccessGrant).where(
            RemateAccessGrant.remate_id == remate_id, RemateAccessGrant.user_id == user_id
        )
        result = await self._db.execute(stmt)
        return result.scalars().first()

    async def list_granted_for_user(self, user_id: uuid.UUID) -> list[Remate]:
        """Remates PRIVATE a los que `user_id` ya canjeó el código en algún momento --
        a diferencia de `list_for_viewer`, esto SÍ consulta `RemateAccessGrant` a
        propósito: es la vista de autoservicio de "Ingresar a remate privado"
        (`RedeemPrivateAccessPage`), no el listado general de remates disponibles, que
        sigue sin mostrar nunca un PRIVATE aunque haya grant (ver el comentario de esa
        rama más arriba y el docstring de `RemateAccessGrant`)."""
        stmt = (
            select(Remate)
            .join(RemateAccessGrant, RemateAccessGrant.remate_id == Remate.id)
            .where(RemateAccessGrant.user_id == user_id, Remate.deleted_at.is_(None))
            .order_by(RemateAccessGrant.created_at.desc())
        )
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    def add_access_grant(self, grant: RemateAccessGrant) -> None:
        self._db.add(grant)

    def add(self, remate: Remate) -> None:
        self._db.add(remate)

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, remate: Remate) -> None:
        await self._db.refresh(remate)
