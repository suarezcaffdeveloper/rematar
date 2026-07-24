"""Núcleo genérico de almacenamiento de imágenes en disco local, compartido por
`Remate` (portada) y `Lote` (galería, `lotes/media_storage.py`, Épica 6/ADR-035).

`save_image` no sabe nada de a qué entidad pertenece la imagen que guarda -- solo
valida Content-Type/tamaño y la persiste bajo `MEDIA_ROOT/<directory>`, devolviendo la
URL pública construida a partir del propio origen de la request (funciona igual en
desarrollo, detrás de un proxy, o en cualquier dominio de despliegue). Quien llama
decide el `directory`/`public_path` -- `save_lote_image` (namespaced por `lote_id`) y
`save_remate_cover_image` (namespaced por `owner_id`, ver docstring más abajo) son los
dos únicos wrappers finos sobre esto, sin duplicar la validación entre ambos.

Refinamiento visual (item 6): reemplaza el campo de "URL de imagen de portada" del
formulario de remate por selección de archivo real, sin storage externo (S3/
Cloudinary) -- mismo criterio ya aceptado en ADR-035 para no sumar dependencias ni
credenciales nuevas a un proyecto que ya persiste `backend/` en disco
(docker-compose.yml). Mantiene el contrato HTTP existente de `POST`/`PATCH /remates`
intacto: `cover_image_url` sigue siendo una URL de texto -- este endpoint nuevo y
aditivo solo devuelve esa URL, quien la usa decide qué hacer con ella.
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


async def save_image(
    directory: Path,
    public_path: str,
    upload: UploadFile,
    settings: Settings,
    request_base_url: str,
) -> str:
    """Valida `upload` (Content-Type y tamaño) y lo persiste en
    `directory/{uuid}.ext`. Devuelve la URL pública absoluta bajo
    `request_base_url/MEDIA_URL_PREFIX/public_path/{uuid}.ext`."""
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
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}{extension}"
    (directory / filename).write_bytes(contents)

    prefix = settings.MEDIA_URL_PREFIX.strip("/")
    return f"{request_base_url.rstrip('/')}/{prefix}/{public_path}/{filename}"


async def save_remate_cover_image(
    owner_id: uuid.UUID,
    upload: UploadFile,
    settings: Settings,
    request_base_url: str,
) -> str:
    """Portada de un remate -- namespaced por `owner_id`, no por `remate_id`: el
    formulario de creación/edición de remate es un único modal (`RemateFormModal`) y en
    modo creación todavía no existe ningún remate al que asociarle la imagen. Mismo
    criterio que `save_lote_image`: esta función no toca ninguna fila de `Remate`, solo
    devuelve la URL -- el frontend la asigna a `cover_image_url` y la persiste con el
    `POST`/`PATCH /remates` ya existente, sin cambios en ese contrato."""
    directory = Path(settings.MEDIA_ROOT) / "remates" / "covers" / str(owner_id)
    public_path = f"remates/covers/{owner_id}"
    return await save_image(directory, public_path, upload, settings, request_base_url)
