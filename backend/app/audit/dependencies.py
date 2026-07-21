from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.audit.service import AuditService
from app.db.session import get_db
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService


def get_audit_log_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> AuditLogRepository:
    return AuditLogRepository(db)


def get_audit_service(
    repository: Annotated[AuditLogRepository, Depends(get_audit_log_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
) -> AuditService:
    return AuditService(repository, remate_service)
