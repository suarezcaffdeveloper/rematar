"""Almacenamiento de imágenes de lote en disco local (Épica 6, Módulo 6.1).

Ver docs/32-gestion-multimedia-lotes.md y ADR-035 para la decisión completa: sin
capacidad de subida binaria previa en el proyecto (`Lote.images[].url` era, hasta este
módulo, una URL de texto sin storage propio, igual que `Remate.cover_image_url` —
docs/15-modulo-lote.md), se agrega este único endpoint aditivo en vez de un storage
externo (S3/Cloudinary) para no sumar dependencias ni credenciales nuevas a un proyecto
que ya persiste el volumen de `backend/` en disco (docker-compose.yml).

`save_lote_image` es un wrapper fino sobre el núcleo genérico de
`remates/media_storage.py::save_image` (extraído para reutilizarlo también en la
portada del remate -- refinamiento visual, item 6 -- sin duplicar la validación de
Content-Type/tamaño). Es deliberadamente ciega a `Lote`/`LoteImage`: solo sabe validar y
guardar un archivo, devolviendo la URL pública resultante. Quien la llama (`LoteService`)
decide qué hacer con esa URL -- hoy, nada: el frontend arma el array `images` completo
del lado del cliente y lo persiste con el `PATCH .../lotes/{id}` ya existente (ver
`LoteUpdate.images`), exactamente igual que si esa URL viniera de cualquier otro lado.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.modules.remates.media_storage import save_image


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
    directory = Path(settings.MEDIA_ROOT) / "lotes" / str(lote_id)
    return await save_image(directory, f"lotes/{lote_id}", upload, settings, request_base_url)
