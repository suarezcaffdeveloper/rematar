"""Migra a Cloudinary los archivos de `MEDIA_ROOT` que la base referencia.

Contexto: antes del storage externo (`app/core/object_storage.py`) las imágenes vivían en
disco. Este script lee las URLs `.../static/<ruta>` que hay en la base a la que apunta
`DATABASE_URL` (típicamente la de producción, en Neon) y, SOLO para las que tienen su
archivo en `MEDIA_ROOT`, lo sube a Cloudinary y reescribe la URL en la base. Los archivos
locales que ninguna fila referencia (subidos en desarrollo) se ignoran solos, y las URLs
cuyo archivo no está en disco se listan como "perdidas".

Por defecto es un dry-run: no sube ni modifica nada. Con `--apply` sí.

Uso (desde backend/, con DATABASE_URL de Neon y CLOUDINARY_* en el entorno):
    python -m app.scripts.migrate_media_to_cloudinary
    python -m app.scripts.migrate_media_to_cloudinary --apply
"""

import argparse
import asyncio
import re
import ssl
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_async_database_url, get_settings
from app.core.object_storage import store_file

_STATIC_URL = re.compile(r"https?://[^\s\"']+?/static/([^\s\"']+\.(?:jpg|jpeg|png|webp|pdf))")

_CONTENT_TYPE_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}

# (tabla, columna, texto a escanear)
_COLUMNS = [
    ("users", "avatar_url", "avatar_url"),
    ("remates", "cover_image_url", "cover_image_url"),
    ("lotes", "images", "images::text"),
    ("lotes", "documents", "documents::text"),
    ("postauction_documents", "url", "url"),
]


async def main(apply: bool) -> None:
    settings = get_settings()
    if apply and not settings.CLOUDINARY_CLOUD_NAME:
        raise SystemExit("Faltan las variables CLOUDINARY_* en el entorno.")

    # `get_async_database_url` descarta `?sslmode=...`: el SSL se pide acá según el host
    # (la base local de docker-compose no lo tiene; Neon sí lo exige).
    database_url = get_async_database_url(settings.DATABASE_URL)
    is_local = make_url(database_url).host in ("db", "localhost", "127.0.0.1")
    engine = create_async_engine(
        database_url,
        connect_args={"ssl": False if is_local else ssl.create_default_context()},
    )
    found: dict[str, set[str]] = {}  # url completa -> rutas relativas (una sola, en realidad)
    async with engine.begin() as conn:
        for table, _column, expr in _COLUMNS:
            query = f"SELECT {expr} FROM {table} WHERE {expr} LIKE '%/static/%'"
            rows = await conn.execute(text(query))
            for (value,) in rows:
                for match in _STATIC_URL.finditer(value):
                    found.setdefault(match.group(0), set()).add(match.group(1))

        print(f"URLs /static/ en la base: {len(found)}")
        migrated = lost = 0
        for old_url, (relative,) in ((u, tuple(r)) for u, r in found.items()):
            path = Path(settings.MEDIA_ROOT) / relative
            if not path.is_file():
                lost += 1
                print(f"PERDIDA  {relative}")
                continue
            print(f"{'SUBE    ' if apply else 'SUBIRÍA '} {relative}")
            if not apply:
                continue
            folder, _, filename = relative.rpartition("/")
            extension = path.suffix.lower()
            _, new_url = await store_file(
                folder=folder,
                extension=extension,
                contents=path.read_bytes(),
                content_type=_CONTENT_TYPE_BY_EXTENSION[extension],
                settings=settings,
                request_base_url="",
                filename=filename,
            )
            for table, column, _expr in _COLUMNS:
                cast = "::jsonb" if column in ("images", "documents") else ""
                source = f"{column}::text" if cast else column
                await conn.execute(
                    text(
                        f"UPDATE {table} SET {column} = replace({source}, :old, :new){cast} "
                        f"WHERE {source} LIKE :pattern"
                    ),
                    {"old": old_url, "new": new_url, "pattern": f"%{old_url}%"},
                )
            migrated += 1

    await engine.dispose()
    print(f"Resumen: {migrated} migradas, {lost} perdidas, {len(found)} referenciadas.")
    if not apply:
        print("Dry-run: no se subió ni modificó nada. Repetí con --apply.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
