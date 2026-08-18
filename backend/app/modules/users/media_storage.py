"""Almacenamiento de fotos de perfil en disco local -- mismo criterio que
`modules/remates/media_storage.py` (portada de remate) y `modules/remates/lotes/
media_storage.py` (galería de lote): reutiliza el núcleo genérico `save_image` en vez
de sumar un storage externo (S3/Cloudinary), ver ADR-035. Namespaced por `user_id`
(`MEDIA_ROOT/users/avatars/{user_id}/`), análogo a `save_lote_image` por `lote_id`.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.modules.remates.media_storage import save_image


async def save_user_avatar_image(
    user_id: uuid.UUID,
    upload: UploadFile,
    settings: Settings,
    request_base_url: str,
) -> str:
    """Valida `upload` (Content-Type y tamaño) y lo persiste en
    `MEDIA_ROOT/users/avatars/{user_id}/{uuid}.ext`. Devuelve la URL pública absoluta --
    no toca ninguna fila de `User`, quien la llama decide cuándo asignarla a
    `avatar_url` (`UserService.update_avatar`, vía `PATCH /users/me`)."""
    directory = Path(settings.MEDIA_ROOT) / "users" / "avatars" / str(user_id)
    return await save_image(directory, f"users/avatars/{user_id}", upload, settings, request_base_url)
