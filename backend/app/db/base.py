"""Punto único de importación de todos los modelos ORM, para Alembic.

`Base.metadata` solo conoce las tablas cuyos modelos hayan sido importados en algún
punto antes de que Alembic inspeccione el metadata. Este módulo existe únicamente para
garantizar eso: cada módulo nuevo que agregue un modelo (remates, lotes, ofertas en fases
futuras) se importa acá, y en ningún otro lado — `alembic/env.py` importa solo este
archivo, no cada módulo por separado.
"""

from app.audit.models import AuditLogEntry
from app.db.base_class import Base
from app.modules.auth.models import RefreshToken
from app.modules.chat.models import ChatMessage
from app.modules.ofertas.models import Oferta
from app.modules.remates.lotes.models import Lote
from app.modules.remates.models import Remate
from app.modules.users.models import User
from app.notifications.models import Notification
from app.postauction.models import PostAuctionCase, PostAuctionTimelineEntry

__all__ = [
    "Base",
    "User",
    "RefreshToken",
    "Remate",
    "Lote",
    "Oferta",
    "ChatMessage",
    "AuditLogEntry",
    "PostAuctionCase",
    "PostAuctionTimelineEntry",
    "Notification",
]
