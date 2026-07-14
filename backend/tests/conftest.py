"""Fixtures compartidas para toda la suite de tests.

Los tests corren contra una base PostgreSQL real (una base separada, `rematar_test`),
no SQLite ni mocks: ADR-002 (Fase 0) fijó a PostgreSQL como única fuente de verdad de
negocio, y el ENUM nativo de roles (ADR-010) es comportamiento específico de Postgres
que SQLite no reproduce fielmente. Antes de correr los tests hay que crear esa base una
vez (ver README, sección de testing):

    docker compose exec db psql -U rematar -d rematar -c "CREATE DATABASE rematar_test;"

Las variables de entorno se fijan ANTES de importar nada de `app`, porque `Settings` (y
por lo tanto la URL con la que se conecta cualquier engine) se resuelve en el momento
del import.

Cada test recibe su propio engine async, creado y descartado dentro del mismo test (ver
`db_engine` más abajo) en vez de reutilizar el engine global de `app/db/session.py`.
Esto no es solo estilo: pytest-asyncio crea un event loop por test por defecto, y las
conexiones de un engine creado en un loop anterior no son válidas en el loop del test
siguiente (se descubrió en la práctica: la suite fallaba de forma intermitente con
"attached to a different loop" al reusar el engine global entre tests). Un engine por
test, creado y `dispose()`-ado dentro del mismo test, evita el problema de raíz porque
nunca cruza la frontera de un loop.
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    # 127.0.0.1 explícito, no "localhost": en esta máquina hay otro proceso escuchando
    # en el mismo número de puerto solo en la interfaz loopback IPv6 (::1), y según cómo
    # resuelva el sistema "localhost" la conexión podía terminar en el proceso
    # equivocado con credenciales distintas (descubierto en la práctica durante esta
    # fase: ver docs/09-arquitectura-y-decisiones.md).
    "postgresql+asyncpg://rematar:rematar@127.0.0.1:5434/rematar_test",
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use")
# DB 1, no la 0 (desarrollo): mismo Redis, distinto namespace lógico, para no pisar datos
# si corrés los tests y el backend de desarrollo contra el mismo Redis al mismo tiempo
# (ver docs/18-integracion-redis.md). Puerto 6380: el mapeado por docker-compose.yml.
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6380/1")

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app


@pytest_asyncio.fixture
async def db_engine() -> AsyncIterator[AsyncEngine]:
    """Un engine nuevo por test, con el esquema recién creado y descartado al final."""
    test_engine = create_async_engine(get_settings().DATABASE_URL)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Sesión directa a la base de test, para que un test arme datos sin pasar por la API
    (ver `tests/test_roles.py`, que crea un admin directamente porque ADR-010 prohíbe
    crearlo vía registro público)."""
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    # `ASGITransport` no dispara el protocolo de `lifespan` de ASGI por sí solo (a
    # diferencia de un servidor real como uvicorn) — sin esto, `app.state.redis` nunca
    # se crearía y cualquier endpoint que dependa de Redis (ej. /health) fallaría en
    # tests aunque funcione perfectamente en producción. `lifespan_context` es el
    # mecanismo estándar de Starlette para disparar startup/shutdown sin un servidor
    # real (ver docs/18-integracion-redis.md, Épica 3 Módulo 3.1).
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()
