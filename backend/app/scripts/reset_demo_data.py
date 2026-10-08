"""Borra TODOS los remates (con lotes, ofertas, garantías, chat, ventas adjudicadas, etc.)
y los usuarios bot, conservando el resto de los usuarios.

Es destructivo e irreversible: por defecto es un dry-run que solo cuenta y lista lo que
borraría (incluye los nombres de los usuarios bot, para revisar que no caiga ningún usuario
real). Con `--apply` ejecuta todo en UNA transacción: si algo falla, no se borra nada.

Un "usuario bot" es cualquiera cuyo `full_name` empieza con "bot" (sin importar mayúsculas)
o que esté referenciado por `bot_profiles.user_id`.

Uso (desde la raíz del repo, apuntando a la base objetivo -- ver el comando en el chat):
    python -m app.scripts.reset_demo_data
    python -m app.scripts.reset_demo_data --apply

No toca archivos subidos (Cloudinary/disco) ni Redis.
"""

import argparse
import asyncio
import ssl

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_async_database_url, get_settings

_BOT_USER_IDS = """(
    SELECT id FROM users WHERE full_name ILIKE 'bot%'
    UNION SELECT user_id FROM bot_profiles
)"""

# Orden importa: casi todas las FK son RESTRICT. (etiqueta, sentencia DELETE)
_DELETES = [
    ("ventas adjudicadas (con documentos y timeline)", "DELETE FROM postauction_cases"),
    ("ofertas", "DELETE FROM ofertas"),
    ("garantías (con sus eventos)", "DELETE FROM garantias"),
    ("mensajes fijados de moderación", "DELETE FROM moderation_pinned_messages"),
    ("bans de remate", "DELETE FROM remate_bans"),
    ("mensajes de chat", "DELETE FROM chat_messages"),
    ("selecciones de remate de bots", "DELETE FROM bot_remate_selections"),
    ("simulaciones de bots", "DELETE FROM bot_simulation_runs"),
    ("lotes (con sus rondas)", "DELETE FROM lotes"),
    ("remates (con sus accesos)", "DELETE FROM remates"),
    ("notificaciones", "DELETE FROM notifications"),
    ("perfiles de bot", "DELETE FROM bot_profiles"),
    (
        "usuarios bot (con sus tokens)",
        f"DELETE FROM users WHERE id IN {_BOT_USER_IDS}",
    ),
]

_COUNTS = [
    ("remates", "SELECT count(*) FROM remates"),
    ("lotes", "SELECT count(*) FROM lotes"),
    ("ofertas", "SELECT count(*) FROM ofertas"),
    ("ventas adjudicadas", "SELECT count(*) FROM postauction_cases"),
    ("garantías", "SELECT count(*) FROM garantias"),
    ("mensajes de chat", "SELECT count(*) FROM chat_messages"),
    ("notificaciones", "SELECT count(*) FROM notifications"),
    ("perfiles de bot", "SELECT count(*) FROM bot_profiles"),
    ("usuarios bot", f"SELECT count(*) FROM users WHERE id IN {_BOT_USER_IDS}"),
    ("usuarios totales", "SELECT count(*) FROM users"),
]


async def main(apply: bool) -> None:
    settings = get_settings()
    database_url = get_async_database_url(settings.DATABASE_URL)
    url = make_url(database_url)
    is_local = url.host in ("db", "localhost", "127.0.0.1")
    engine = create_async_engine(
        database_url,
        connect_args={"ssl": False if is_local else ssl.create_default_context()},
    )
    print(f"Base objetivo: {url.host}/{url.database}")

    async with engine.begin() as conn:
        print("\nEstado actual:")
        for label, query in _COUNTS:
            print(f"  {label}: {(await conn.execute(text(query))).scalar_one()}")

        print("\nUsuarios bot que se borrarían:")
        rows = await conn.execute(
            text(f"SELECT full_name, email FROM users WHERE id IN {_BOT_USER_IDS} ORDER BY 1")
        )
        for name, email in rows:
            print(f"  {name} <{email}>")

        print("\nUsuarios que se CONSERVAN:")
        rows = await conn.execute(
            text(
                f"SELECT full_name, email, role FROM users "
                f"WHERE id NOT IN {_BOT_USER_IDS} ORDER BY 1"
            )
        )
        for name, email, role in rows:
            print(f"  {name} <{email}> ({role})")

        if not apply:
            print("\nDry-run: no se borró nada. Revisá las listas y repetí con --apply.")
            await conn.rollback()
            await engine.dispose()
            return

        print("\nBorrando:")
        for label, statement in _DELETES:
            result = await conn.execute(text(statement))
            print(f"  {label}: {result.rowcount}")

    await engine.dispose()
    print("\nListo. Cambios confirmados.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
