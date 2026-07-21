"""Tests de `AuditLogRepository` (Épica 7, Módulo 7.2), directos contra Postgres real
(sin mocks, mismo criterio que el resto de la suite -- ver docstring de
`tests/conftest.py`). `record()` no comitea por diseño (ver ADR-039 sección A), así que
estos tests llaman `commit()` explícitamente después de cada `record()` para poder
consultar las filas.

`actor_id`/`remate_id` son FKs reales (`ON DELETE SET NULL`, ver `app/audit/models.py`)
-- a diferencia de `resource_id` (sin FK, un `AuditLogEntry` puede referenciar cualquier
tipo de recurso), estos dos exigen filas de `users`/`remates` realmente persistidas. Se
crean directo por ORM (sin pasar por HTTP, más rápido para lo que testea este archivo:
el repositorio en sí, no el flujo de negocio completo).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.security import hash_password
from app.modules.remates.models import Remate, RemateCategory
from app.modules.users.models import User, UserRole


async def _make_user(db_session: AsyncSession, email: str) -> User:
    user = User(
        email=email, hashed_password=hash_password("password123"), full_name="Test", role=UserRole.REMATADOR
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_remate(db_session: AsyncSession, owner: User) -> Remate:
    remate = Remate(owner_id=owner.id, title="Remate de prueba", category=RemateCategory.HACIENDA)
    db_session.add(remate)
    await db_session.flush()
    return remate


def _record(
    repo: AuditLogRepository,
    *,
    actor_id: uuid.UUID | None = None,
    actor_name: str | None = "Ana Rematadora",
    actor_role: str | None = "rematador",
    action: str = "remate.created",
    resource_type: str = "remate",
    resource_id: uuid.UUID | None = None,
    remate_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> None:
    repo.record(
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id if resource_id is not None else uuid.uuid4(),
        remate_id=remate_id,
        details=details,
    )


async def test_record_persists_after_explicit_commit(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "audrep1@example.com")
    remate = await _make_remate(db_session, owner)
    repo = AuditLogRepository(db_session)
    resource_id = uuid.uuid4()

    _record(
        repo,
        actor_id=owner.id,
        action="remate.created",
        resource_id=resource_id,
        remate_id=remate.id,
        details={"title": "Remate de prueba"},
    )
    await repo.commit()

    items, total = await repo.list_paginated(offset=0, limit=10)
    assert total == 1
    assert items[0].actor_id == owner.id
    assert items[0].action == "remate.created"
    assert items[0].resource_id == resource_id
    assert items[0].remate_id == remate.id
    assert items[0].details == {"title": "Remate de prueba"}


async def test_record_without_explicit_commit_is_rolled_back_with_the_session(
    db_session: AsyncSession,
) -> None:
    """`record()` deliberadamente no comitea -- ver ADR-039 sección A: queda pendiente
    hasta que el caller (un servicio de dominio) haga su propio `commit()`. Un
    `rollback()` de la sesión (nunca llamado) descarta el registro sin dejar rastro --
    exactamente lo que pasaría si la transacción del dominio que lo originó fallara."""
    repo = AuditLogRepository(db_session)
    _record(repo)
    await db_session.rollback()

    items, total = await repo.list_paginated(offset=0, limit=10)
    assert total == 0
    assert items == []


async def test_record_allows_null_actor_and_remate(db_session: AsyncSession) -> None:
    """Acciones sin actor humano (ej. `RemateService.try_auto_finish`) o sin remate
    asociado (ej. login/logout) dejan esas columnas en `NULL` -- ambas son nullable a
    propósito (ver `app/audit/models.py`)."""
    repo = AuditLogRepository(db_session)
    _record(repo, actor_id=None, actor_name=None, actor_role=None, remate_id=None)
    await repo.commit()

    items, total = await repo.list_paginated(offset=0, limit=10)
    assert total == 1
    assert items[0].actor_id is None
    assert items[0].remate_id is None


async def test_list_paginated_filters_by_actor_action_resource_type_and_remate(
    db_session: AsyncSession,
) -> None:
    owner_a = await _make_user(db_session, "audrep2-a@example.com")
    owner_b = await _make_user(db_session, "audrep2-b@example.com")
    remate_a = await _make_remate(db_session, owner_a)
    remate_b = await _make_remate(db_session, owner_b)

    repo = AuditLogRepository(db_session)
    _record(
        repo,
        actor_id=owner_a.id,
        action="remate.created",
        resource_type="remate",
        remate_id=remate_a.id,
    )
    _record(
        repo, actor_id=owner_b.id, action="lote.opened", resource_type="lote", remate_id=remate_a.id
    )
    _record(
        repo, actor_id=owner_a.id, action="lote.opened", resource_type="lote", remate_id=remate_b.id
    )
    await repo.commit()

    by_actor, total_by_actor = await repo.list_paginated(offset=0, limit=10, actor_id=owner_a.id)
    assert total_by_actor == 2
    assert all(item.actor_id == owner_a.id for item in by_actor)

    by_action, total_by_action = await repo.list_paginated(offset=0, limit=10, action="lote.opened")
    assert total_by_action == 2
    assert all(item.action == "lote.opened" for item in by_action)

    by_resource_type, total_by_rt = await repo.list_paginated(
        offset=0, limit=10, resource_type="remate"
    )
    assert total_by_rt == 1
    assert by_resource_type[0].resource_type == "remate"

    by_remate, total_by_remate = await repo.list_paginated(offset=0, limit=10, remate_id=remate_a.id)
    assert total_by_remate == 2
    assert all(item.remate_id == remate_a.id for item in by_remate)


async def test_list_paginated_filters_by_date_range(db_session: AsyncSession) -> None:
    repo = AuditLogRepository(db_session)
    _record(repo, action="auth.login")
    await repo.commit()

    entry = (await repo.list_paginated(offset=0, limit=10))[0][0]
    entry.occurred_at = datetime.now(UTC) - timedelta(days=10)
    await db_session.commit()

    boundary = datetime.now(UTC) - timedelta(days=1)
    _, total_before = await repo.list_paginated(offset=0, limit=10, date_to=boundary)
    assert total_before == 1

    _, total_after = await repo.list_paginated(offset=0, limit=10, date_from=boundary)
    assert total_after == 0


async def test_list_paginated_search_matches_actor_name(db_session: AsyncSession) -> None:
    repo = AuditLogRepository(db_session)
    _record(repo, actor_name="Carlos Comprador")
    _record(repo, actor_name="Ana Rematadora")
    await repo.commit()

    items, total = await repo.list_paginated(offset=0, limit=10, search="rematadora")
    assert total == 1
    assert items[0].actor_name == "Ana Rematadora"


async def test_list_paginated_orders_desc_by_default_and_supports_pagination(
    db_session: AsyncSession,
) -> None:
    repo = AuditLogRepository(db_session)
    for i in range(5):
        _record(repo, action=f"action.{i}")
    await repo.commit()

    # Las 5 filas de este commit comparten el mismo `now()` de Postgres (estable dentro
    # de una misma transacción) -- se ajustan a mano para que el orden sea determinista,
    # mismo criterio que `test_list_paginated_filters_by_date_range`.
    items, _ = await repo.list_paginated(offset=0, limit=10)
    by_action = {item.action: item for item in items}
    base = datetime.now(UTC) - timedelta(minutes=10)
    for i in range(5):
        by_action[f"action.{i}"].occurred_at = base + timedelta(minutes=i)
    await db_session.commit()

    page1, total = await repo.list_paginated(offset=0, limit=2)
    assert total == 5
    assert len(page1) == 2
    assert [item.action for item in page1] == ["action.4", "action.3"]  # más reciente primero

    page2, _ = await repo.list_paginated(offset=2, limit=2)
    assert [item.action for item in page2] == ["action.2", "action.1"]

    ascending, _ = await repo.list_paginated(offset=0, limit=1, sort="asc")
    assert ascending[0].action == "action.0"
