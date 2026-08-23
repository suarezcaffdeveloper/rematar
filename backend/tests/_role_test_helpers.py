"""Utilidad compartida para tests que registran una cuenta `empresa`/`rematador` y solo
necesitan un actor autenticado con ese rol -- no están probando el flujo de aprobación en
sí (eso lo cubre `test_roles.py`). Desde que el registro público de esos dos roles queda
`is_active=False` hasta que un admin lo aprueba (RF-03, ver `UserService.register`), estos
tests activan la cuenta directamente por SQL para no tener que levantar un admin y pasar
por `PATCH /users/{id}/status` en cada uno.

Usa su propio engine efímero contra la misma `DATABASE_URL` de test (no el `db_engine` de
`conftest.py`, atado al loop del test y no siempre disponible como fixture en estos
helpers locales) -- mismo patrón que ya usa `ws_client` en `conftest.py` para reconectar
sin reutilizar un `AsyncEngine` ligado a otro loop.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings

ROLES_PENDING_APPROVAL = {"empresa", "rematador"}


async def activate_pending_account(email: str) -> None:
    engine = create_async_engine(get_settings().DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE users SET is_active = true WHERE email = :email"), {"email": email}
            )
    finally:
        await engine.dispose()


def activate_pending_account_sync(email: str) -> None:
    """Para helpers no-`async def` (tests que usan `TestClient` en vez de `AsyncClient`,
    ej. los del Gateway WebSocket). `TestClient` corre la app en su propio hilo/loop (un
    "portal" de `anyio`, ver docstring de `ws_client` en `conftest.py`), pero el hilo del
    test en sí también puede tener un loop de `pytest-asyncio` activo -- `asyncio.run()`
    revienta con "cannot be called from a running event loop" si lo hay. Correrlo en un
    hilo nuevo, sin loop propio, lo evita sin importar qué loop tenga el hilo llamante."""
    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(asyncio.run, activate_pending_account(email)).result()
