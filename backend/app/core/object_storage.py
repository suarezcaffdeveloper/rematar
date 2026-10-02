"""Storage de archivos subidos (imágenes de lote/remate/avatar y documentos de post-remate).

Dos backends detrás de la misma función, elegido por configuración:

- **Cloudinary** (si `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`
  están definidas): los archivos sobreviven a redeploys y reinicios -- necesario en
  plataformas con disco efímero (Render free). Se usa la API REST con `httpx` (ya es
  dependencia del proyecto), sin sumar el SDK de Cloudinary.
- **Disco local** (default, sin credenciales): `MEDIA_ROOT` servido por `StaticFiles`, igual
  que antes -- desarrollo local, docker-compose y tests no cambian.

Quien llama no sabe cuál backend está activo: recibe el nombre de archivo y la URL pública.
"""

import hashlib
import time
import uuid
from pathlib import Path

import httpx

from app.core.config import Settings
from app.core.exceptions import BusinessRuleError

_CLOUDINARY_ROOT_FOLDER = "rematar"
_UPLOAD_TIMEOUT_SECONDS = 30.0


def _is_cloudinary_enabled(settings: Settings) -> bool:
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )


def _resource_type(extension: str) -> str:
    """Cloudinary trata los PDF como archivos "raw" -- las imágenes, como "image"."""
    return "raw" if extension == ".pdf" else "image"


def _public_id(folder: str, filename: str, extension: str) -> str:
    """En "image" Cloudinary agrega la extensión al servir, así que el `public_id` va sin
    ella; en "raw" la extensión es parte del `public_id`."""
    stem = filename if _resource_type(extension) == "raw" else filename.removesuffix(extension)
    return f"{_CLOUDINARY_ROOT_FOLDER}/{folder}/{stem}"


def _sign(params: dict[str, str], api_secret: str) -> str:
    to_sign = "&".join(f"{key}={params[key]}" for key in sorted(params))
    return hashlib.sha1(f"{to_sign}{api_secret}".encode()).hexdigest()  # noqa: S324 -- lo exige Cloudinary


async def store_file(
    *,
    folder: str,
    extension: str,
    contents: bytes,
    content_type: str,
    settings: Settings,
    request_base_url: str,
    filename: str | None = None,
) -> tuple[str, str]:
    """Persiste `contents` bajo `folder` con un nombre aleatorio (o `filename`, si se
    pasa -- lo usa el script de migración para conservar el nombre original). Devuelve
    `(filename, url pública absoluta)`."""
    filename = filename or f"{uuid.uuid4()}{extension}"

    if not _is_cloudinary_enabled(settings):
        directory = Path(settings.MEDIA_ROOT) / folder
        directory.mkdir(parents=True, exist_ok=True)
        (directory / filename).write_bytes(contents)
        prefix = settings.MEDIA_URL_PREFIX.strip("/")
        return filename, f"{request_base_url.rstrip('/')}/{prefix}/{folder}/{filename}"

    signed = {
        "public_id": _public_id(folder, filename, extension),
        "timestamp": str(int(time.time())),
    }
    url = (
        f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}"
        f"/{_resource_type(extension)}/upload"
    )
    data = {
        **signed,
        "api_key": settings.CLOUDINARY_API_KEY,
        "signature": _sign(signed, settings.CLOUDINARY_API_SECRET),
    }
    try:
        async with httpx.AsyncClient(timeout=_UPLOAD_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url, data=data, files={"file": (filename, contents, content_type)}
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise BusinessRuleError(
            "No se pudo subir el archivo al almacenamiento. Intentá de nuevo.",
            error=type(exc).__name__,
        ) from exc
    return filename, response.json()["secure_url"]


async def delete_stored_file(*, folder: str, filename: str, settings: Settings) -> None:
    """Borra un archivo ya guardado -- best-effort, nunca lanza (mismo criterio que el
    borrado en disco que reemplaza: un archivo que ya no está no es un error)."""
    extension = Path(filename).suffix

    if not _is_cloudinary_enabled(settings):
        (Path(settings.MEDIA_ROOT) / folder / filename).unlink(missing_ok=True)
        return

    signed = {
        "public_id": _public_id(folder, filename, extension),
        "timestamp": str(int(time.time())),
    }
    url = (
        f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}"
        f"/{_resource_type(extension)}/destroy"
    )
    data = {
        **signed,
        "api_key": settings.CLOUDINARY_API_KEY,
        "signature": _sign(signed, settings.CLOUDINARY_API_SECRET),
    }
    try:
        async with httpx.AsyncClient(timeout=_UPLOAD_TIMEOUT_SECONDS) as client:
            await client.post(url, data=data)
    except httpx.HTTPError:
        return
