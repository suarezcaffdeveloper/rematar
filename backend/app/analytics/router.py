"""Endpoint HTTP del Analytics Service (Épica 7, Módulo 7.1). Ver
docs/35-dashboard-analitica-tiempo-real.md.

No vive dentro de `app/modules/remates/` -- mismo criterio que `app/snapshot/router.py`/
`app/modules/chat/router.py`: un módulo top-level propio, montado directamente en
`app/api/router.py` con el path efectivo `/remates/{remate_id}/analytics`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.analytics.dependencies import get_analytics_service
from app.analytics.schemas import RemateAnalyticsSnapshot
from app.analytics.service import AnalyticsService
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User

router = APIRouter()


@router.get(
    "/remates/{remate_id}/analytics",
    response_model=RemateAnalyticsSnapshot,
    summary="Analítica en tiempo real de un remate -- solo dueño o administrador",
)
async def get_remate_analytics(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> RemateAnalyticsSnapshot:
    return await service.build(remate_id, current_user)
