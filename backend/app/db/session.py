"""Engine y factory de sesiones async de SQLAlchemy.

`expire_on_commit=False`: sin esto, tras un `await session.commit()` SQLAlchemy expira
todos los atributos de los objetos de esa sesión y los recarga con una query nueva la
próxima vez que se acceden — perfectamente razonable en código síncrono, pero en async
un acceso a un atributo expirado *fuera* de una corrutina que pueda hacer `await` levanta
`MissingGreenlet`. Es la configuración estándar recomendada para SQLAlchemy 2.0 async.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import ssl
from app.core.config import get_async_database_url, get_settings

settings = get_settings()

database_url = settings.DATABASE_URL.replace(
    "postgresql://",
    "postgresql+asyncpg://",
).split("?")[0]

ssl_context = ssl.create_default_context()

engine = create_async_engine(
    get_async_database_url(settings.DATABASE_URL),
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dependencia de FastAPI: una sesión por request.

    No hace commit automático al final: cada servicio decide explícitamente cuándo
    confirmar una transacción, para que una ruta que orqueste varias operaciones de
    escritura pueda tratarlas como una única unidad atómica. Si la sesión se cierra con
    una transacción sin confirmar (por una excepción), SQLAlchemy la revierte.
    """
    async with AsyncSessionLocal() as session:
        yield session
