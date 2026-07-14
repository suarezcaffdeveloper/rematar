"""Bootstrap: crea la cuenta de administrador inicial, si todavía no existe.

Deliberadamente no es un endpoint de la API — ver el razonamiento en
`docs/adr/ADR-010-enum-nativo-de-roles-en-postgres.md` y en
`app/modules/users/schemas.py`: el rol `admin` nunca se asigna vía registro público.

Uso (con el stack levantado):
    docker compose exec backend python -m app.scripts.create_superuser

Lee `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD` y `FIRST_ADMIN_FULL_NAME` del entorno
(las mismas variables que el resto de la app, ver `app/core/config.py` y `.env.example`).
Es idempotente: si ya existe un usuario con ese email, no hace nada.
"""

import asyncio
import sys

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService

logger = get_logger(__name__)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings)

    if not settings.FIRST_ADMIN_EMAIL or not settings.FIRST_ADMIN_PASSWORD:
        logger.error(
            "missing_first_admin_settings",
            hint="Definí FIRST_ADMIN_EMAIL y FIRST_ADMIN_PASSWORD en .env antes de correr esto.",
        )
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        service = UserService(UserRepository(db))
        admin = await service.create_admin_if_missing(
            email=settings.FIRST_ADMIN_EMAIL,
            password=settings.FIRST_ADMIN_PASSWORD,
            full_name=settings.FIRST_ADMIN_FULL_NAME,
        )

    if admin is None:
        logger.info("admin_already_exists", email=settings.FIRST_ADMIN_EMAIL)
    else:
        logger.info("admin_created", email=admin.email, id=str(admin.id))


if __name__ == "__main__":
    asyncio.run(main())
