"""Almacenamiento de imágenes de lote en disco local (Épica 6, Módulo 6.1).

Ver docs/32-gestion-multimedia-lotes.md y ADR-035 para la decisión completa: sin
capacidad de subida binaria previa en el proyecto (`Lote.images[].url` era, hasta este
módulo, una URL de texto sin storage propio, igual que `Remate.cover_image_url` —
docs/15-modulo-lote.md), se agrega este único endpoint aditivo en vez de un storage
externo (S3/Cloudinary) para no sumar dependencias ni credenciales nuevas a un proyecto
que ya persiste el volumen de `backend/` en disco (docker-compose.yml).

Esta función es deliberadamente ciega a `Lote`/`LoteImage`: solo sabe validar y guardar
un archivo, devolviendo la URL pública resultante. Quien la llama (`LoteService`)
decide qué hacer con esa URL -- hoy, nada: el frontend arma el array `images` completo
del lado del cliente y lo persiste con el `PATCH .../lotes/{id}` ya existente (ver
`LoteUpdate.images`), exactamente igual que si esa URL viniera de cualquier otro lado.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.core.exceptions import BusinessRuleError

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def save_lote_image(
    lote_id: uuid.UUID,
    upload: UploadFile,
    settings: Settings,
    request_base_url: str,
) -> str:
    """Valida `upload` (Content-Type y tamaño) y lo persiste en
    `MEDIA_ROOT/lotes/{lote_id}/{uuid}.ext`. Devuelve la URL pública absoluta,
    construida a partir de `request_base_url` (el propio origen de la request, no un
    valor fijo de configuración -- funciona igual en desarrollo, detrás de un proxy, o
    en cualquier dominio de despliegue sin hardcodear ninguno)."""
    if upload.content_type not in settings.ALLOWED_IMAGE_CONTENT_TYPES:
        raise BusinessRuleError(
            "Formato de imagen no admitido. Usá JPG, PNG o WEBP.",
            content_type=upload.content_type,
        )

    contents = await upload.read()
    if len(contents) > settings.MAX_IMAGE_UPLOAD_BYTES:
        max_mb = settings.MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)
        raise BusinessRuleError(
            f"La imagen supera el tamaño máximo permitido ({max_mb} MB).",
            size=len(contents),
        )

    extension = _EXTENSION_BY_CONTENT_TYPE[upload.content_type]
    directory = Path(settings.MEDIA_ROOT) / "lotes" / str(lote_id)
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}{extension}"
    (directory / filename).write_bytes(contents)

    prefix = settings.MEDIA_URL_PREFIX.strip("/")
    return f"{request_base_url.rstrip('/')}/{prefix}/lotes/{lote_id}/{filename}"
