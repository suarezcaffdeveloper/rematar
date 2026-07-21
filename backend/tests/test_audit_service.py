"""Tests de `AuditService` (Épica 7, Módulo 7.2), llamado directamente (sin pasar por
HTTP) contra Postgres real -- mismo criterio y mismos helpers que
`test_analytics_service.py`. Los tests de HTTP end-to-end (200/403/404/401, filtros de
query) están en `test_audit_router.py`.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.audit.schemas import AuditLogFilters
from app.audit.service import AuditService
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _NoOpEventBus:
    async def publish(self, event: DomainEvent) -> None:
        pass


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    payload = {"email": email, "password": "password123", "full_name": "Test", "role": role}
    register = await client.post(REGISTER_URL, json=payload)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _get_user_by_email(db_session: AsyncSession, email: str) -> User:
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    return user


async def _make_admin(db_session: AsyncSession, email: str) -> User:
    # ADR-010: no hay registro público de admin -- se crea directo en la base, mismo
    # criterio que `test_analytics_service.py`.
    admin = User(
        email=email,
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de auditoría",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _no_filters() -> AuditLogFilters:
    return AuditLogFilters()


def _make_service(db_session: AsyncSession) -> AuditService:
    remate_service = RemateService(
        RemateRepository(db_session),
        LoteRepository(db_session),
        _NoOpEventBus(),
        AuditLogRepository(db_session),
    )
    return AuditService(AuditLogRepository(db_session), remate_service)


# --- list_global -----------------------------------------------------------------------


async def test_list_global_succeeds_for_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "aud-svc1@example.com")
    await _create_remate(client, owner_token)  # genera al menos remate.created + auth.login

    admin = await _make_admin(db_session, "aud-svc1-admin@example.com")
    service = _make_service(db_session)

    items, total = await service.list_global(
        viewer=admin, filters=_no_filters(), page=1, page_size=50
    )
    assert total >= 1
    assert len(items) == total


async def test_list_global_denies_non_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "aud-svc2@example.com")
    viewer = await _get_user_by_email(db_session, "aud-svc2@example.com")
    service = _make_service(db_session)

    with pytest.raises(ForbiddenError):
        await service.list_global(viewer=viewer, filters=_no_filters(), page=1, page_size=50)


# --- list_for_remate ---------------------------------------------------------------------


async def test_list_for_remate_succeeds_for_owner(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "aud-svc3@example.com")
    remate = await _create_remate(client, owner_token)
    owner = await _get_user_by_email(db_session, "aud-svc3@example.com")

    service = _make_service(db_session)
    items, total = await service.list_for_remate(
        uuid.UUID(remate["id"]), viewer=owner, filters=_no_filters(), page=1, page_size=50
    )
    assert total >= 1
    assert all(item.remate_id == uuid.UUID(remate["id"]) for item in items)


async def test_list_for_remate_succeeds_for_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "aud-svc4@example.com")
    remate = await _create_remate(client, owner_token)
    admin = await _make_admin(db_session, "aud-svc4-admin@example.com")

    service = _make_service(db_session)
    items, total = await service.list_for_remate(
        uuid.UUID(remate["id"]), viewer=admin, filters=_no_filters(), page=1, page_size=50
    )
    assert total >= 1


async def test_list_for_remate_denies_unrelated_rematador(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "aud-svc5@example.com")
    remate = await _create_remate(client, owner_token)
    # Publicado (no DRAFT) para que sea *visible* al extraño y el chequeo llegue al 403
    # (no al 404 de "no existe"/oculta-borrador).
    schedule = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule.status_code == 200, schedule.text

    await _owner(client, "aud-svc5-stranger@example.com")
    stranger = await _get_user_by_email(db_session, "aud-svc5-stranger@example.com")

    service = _make_service(db_session)
    with pytest.raises(ForbiddenError):
        await service.list_for_remate(
            uuid.UUID(remate["id"]), viewer=stranger, filters=_no_filters(), page=1, page_size=50
        )


async def test_list_for_remate_raises_not_found_for_invisible_draft(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "aud-svc6@example.com")
    remate = await _create_remate(client, owner_token)  # queda en DRAFT

    await _owner(client, "aud-svc6-stranger@example.com")
    stranger = await _get_user_by_email(db_session, "aud-svc6-stranger@example.com")

    service = _make_service(db_session)
    with pytest.raises(NotFoundError):
        await service.list_for_remate(
            uuid.UUID(remate["id"]), viewer=stranger, filters=_no_filters(), page=1, page_size=50
        )
