"""Configuración centralizada de la aplicación.

Toda variable de entorno del proyecto se declara acá, con su tipo y su valor por
defecto (si tiene uno razonable para desarrollo local). Ningún otro módulo debe leer
`os.environ` directamente: si un módulo necesita una variable de entorno nueva, se
agrega acá primero.

Por qué pydantic-settings y no `os.getenv` disperso por el código:
- Falla rápido (al arrancar la app, no en el primer request que la necesita) si falta
  una variable requerida o tiene un tipo inválido.
- Un único lugar navegable para saber qué configuración existe (RNF-17: mantenibilidad).
- Validación automática de tipos (puertos como int, listas, etc.) sin parsing manual.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

def get_async_database_url(database_url: str) -> str:
    url = database_url.replace(
        "postgresql://",
        "postgresql+asyncpg://",
    )

    if "?" in url:
        url = url.split("?")[0]

    return url

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Identidad del proyecto ---
    PROJECT_NAME: str = "RematAR"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    API_V1_PREFIX: str = "/api/v1"

    # --- Logging ---
    LOG_LEVEL: str = "INFO"
    # En "local" los logs se imprimen legibles para humanos; en el resto, como JSON
    # estructurado para que un agregador de logs los pueda indexar (RNF-15).
    LOG_JSON: bool = Field(default=False)

    # --- Base de datos ---
    # Formato esperado: postgresql+asyncpg://usuario:password@host:puerto/nombre_db
    DATABASE_URL: str

    # --- Redis (Épica 3, Módulo 3.1) ---
    # Formato esperado: redis://[:password@]host:puerto/db. Ver docs/18-integracion-redis.md.
    REDIS_URL: str

    # --- Gateway WebSocket (Épica 3, Módulo 3.3) ---
    # Ver docs/20-gateway-websocket.md y ADR-023.
    WS_AUTH_TIMEOUT_SECONDS: float = 10.0
    WS_PING_INTERVAL_SECONDS: float = 20.0
    WS_PONG_TIMEOUT_SECONDS: float = 40.0

    # --- Sincronización de eventos en tiempo real (Épica 3, Módulo 3.5) ---
    # Backoff exponencial de reconexión del Event Consumer a Redis Pub/Sub — ver
    # docs/22-sincronizacion-tiempo-real.md y ADR-025.
    REALTIME_CONSUMER_RETRY_BASE_SECONDS: float = 1.0
    REALTIME_CONSUMER_RETRY_MAX_SECONDS: float = 30.0

    # --- Snapshot Service (Épica 3, Módulo 3.6) ---
    # Ver docs/23-snapshot-service.md y ADR-026.
    SNAPSHOT_RECENT_OFFERS_LIMIT: int = 10
    SNAPSHOT_CACHE_TTL_SECONDS: float = 2.0

    # --- Autenticación / JWT ---
    # Sin valor por defecto a propósito: un secreto hardcodeado en el código sería
    # una vulnerabilidad. Debe venir siempre de .env / del entorno de despliegue.
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- CORS (para el futuro frontend Vite) ---
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # --- Bootstrap del primer administrador (ver app/scripts/create_superuser.py) ---
    FIRST_ADMIN_EMAIL: str | None = None
    FIRST_ADMIN_PASSWORD: str | None = None
    FIRST_ADMIN_FULL_NAME: str = "Administrador"

    # --- Media: subida de imágenes de lote (Épica 6, Módulo 6.1) ---
    # Disco local montado como volumen (ver docker-compose.yml, "./backend:/app") y
    # servido vía StaticFiles (app/main.py) -- sin storage externo (S3/Cloudinary) en
    # esta fase, ver docs/32-gestion-multimedia-lotes.md y ADR-035.
    MEDIA_ROOT: str = "media"
    MEDIA_URL_PREFIX: str = "/static"
    MAX_IMAGE_UPLOAD_BYTES: int = 5 * 1024 * 1024
    ALLOWED_IMAGE_CONTENT_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp"]

    # --- Chat del Remate (Épica 6, Módulo 6.4) ---
    # Ver docs/34-chat-del-remate.md y ADR-037.
    CHAT_MESSAGE_MAX_LENGTH: int = 500
    CHAT_HISTORY_DEFAULT_LIMIT: int = 50
    # Rate limiting de mensajes: ventana fija (RedisRateLimiter), no delegado al cliente.
    CHAT_RATE_LIMIT_MAX_MESSAGES: int = 5
    CHAT_RATE_LIMIT_WINDOW_SECONDS: int = 10
    # Más laxo que el de mensajes -- "está escribiendo..." es de mejor esfuerzo, no
    # necesita protegerse tan estrictamente, solo evitar que inunde la sala.
    CHAT_TYPING_RATE_LIMIT_WINDOW_SECONDS: int = 2

    # --- Dashboard de Analítica en Tiempo Real (Épica 7, Módulo 7.1) ---
    # Ver docs/35-dashboard-analitica-tiempo-real.md y ADR-038.
    # TTL corto de la caché Redis de agregados (mismo criterio que
    # SNAPSHOT_CACHE_TTL_SECONDS): absorbe ráfagas de refetch sin servir un número viejo
    # por mucho tiempo.
    ANALYTICS_CACHE_TTL_SECONDS: float = 3.0
    ANALYTICS_BIDS_TIMELINE_MINUTES: int = 20
    ANALYTICS_RECENT_EVENTS_LIMIT: int = 15
    ANALYTICS_OFFERS_RATE_WINDOW_SECONDS: int = 60

    # --- Sistema de Auditoría y Trazabilidad (Épica 7, Módulo 7.2) ---
    # Ver docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.
    AUDIT_LOG_DEFAULT_PAGE_SIZE: int = 50

    # --- Moderación y Administración en Tiempo Real (Épica 7, Módulo 7.6) ---
    # Ver docs/42-moderacion-en-tiempo-real.md y ADR-045. Umbral de intentos de oferta
    # inválidos consecutivos (dentro de la ventana) que dispara la notificación al
    # rematador -- `ModerationRedisGateway.record_invalid_bid_attempt`.
    MODERATION_INVALID_BID_THRESHOLD: int = 5
    MODERATION_INVALID_BID_WINDOW_SECONDS: int = 300

    # --- Notificaciones por email ---
    # SMTP genérico -- funciona con Gmail (usando una "Contraseña de aplicación", ver
    # README) o cualquier otro proveedor SMTP estándar. `EMAIL_ENABLED=false` (o sin
    # `SMTP_HOST`) desactiva el envío real sin condicionar el resto del flujo de
    # adjudicación: se usa un `NullEmailSender` que solo loguea (ver
    # `app/notify/dependencies.py`), útil para desarrollo local sin credenciales.
    EMAIL_ENABLED: bool = True
    EMAIL_FROM: str = "no-reply@rematar.io"
    EMAIL_FROM_NAME: str = "RematAR"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_TIMEOUT_SECONDS: float = 10.0


@lru_cache
def get_settings() -> Settings:
    """Devuelve la instancia única (cacheada) de Settings.

    Se usa `lru_cache` en vez de una variable global de módulo para que sea
    fácilmente reemplazable por Depends() en tests (FastAPI permite overridear
    dependencias, no variables globales).
    """
    return Settings()
