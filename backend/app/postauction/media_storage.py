"""Almacenamiento en disco local de documentos adjuntos a una venta adjudicada (Épica 7,
Módulo 7.5 -- continuación). Ver docs/41-gestion-post-remate.md.

Mismo criterio ya aceptado en ADR-035 para imágenes de lote (`app/modules/remates/
media_storage.py::save_image`): sin storage externo (S3/Cloudinary), se persiste bajo
`MEDIA_ROOT` (volumen ya montado, `docker-compose.yml`) y se sirve vía `StaticFiles`
(`app/main.py`). No se reutiliza `save_image` porque ese helper es ciego a PDF (solo
valida `ALLOWED_IMAGE_CONTENT_TYPES`) -- acá el content-type/tamaño permitido es el de
`ALLOWED_DOCUMENT_CONTENT_TYPES`/`MAX_DOCUMENT_UPLOAD_BYTES` (`app/core/config.py`, ya
existían sin usar antes de este módulo).
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.core.exceptions import BusinessRuleError

_EXTENSION_BY_CONTENT_TYPE = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class SavedDocument:
    def __init__(self, *, filename: str, url: str, file_size: int) -> None:
        self.filename = filename
        self.url = url
        self.file_size = file_size


async def save_postauction_document(
    case_id: uuid.UUID,
    upload: UploadFile,
    settings: Settings,
    request_base_url: str,
) -> SavedDocument:
    """Valida `upload` (Content-Type y tamaño) y lo persiste en
    `MEDIA_ROOT/postauction/{case_id}/{uuid}.ext`. Devuelve el nombre de archivo generado,
    la URL pública absoluta y el tamaño en bytes -- quien llama arma el registro de
    `PostAuctionDocument` con esos datos más el nombre original y el tipo de documento
    elegido por el usuario."""
    if upload.content_type not in settings.ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise BusinessRuleError(
            "Formato de archivo no admitido. Usá PDF, JPG, PNG o WEBP.",
            content_type=upload.content_type,
        )

    contents = await upload.read()
    if len(contents) > settings.MAX_DOCUMENT_UPLOAD_BYTES:
        max_mb = settings.MAX_DOCUMENT_UPLOAD_BYTES // (1024 * 1024)
        raise BusinessRuleError(
            f"El archivo supera el tamaño máximo permitido ({max_mb} MB).",
            size=len(contents),
        )

    extension = _EXTENSION_BY_CONTENT_TYPE[upload.content_type]
    directory = Path(settings.MEDIA_ROOT) / "postauction" / str(case_id)
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}{extension}"
    (directory / filename).write_bytes(contents)

    prefix = settings.MEDIA_URL_PREFIX.strip("/")
    url = f"{request_base_url.rstrip('/')}/{prefix}/postauction/{case_id}/{filename}"
    return SavedDocument(filename=filename, url=url, file_size=len(contents))


def delete_postauction_document_file(
    case_id: uuid.UUID, filename: str, settings: Settings
) -> None:
    """Borra el archivo en disco de un documento ya eliminado de la base -- best-effort,
    nunca lanza si el archivo ya no está (mismo criterio defensivo que el resto de este
    módulo con referencias que podrían no resolver)."""
    path = Path(settings.MEDIA_ROOT) / "postauction" / str(case_id) / filename
    path.unlink(missing_ok=True)
