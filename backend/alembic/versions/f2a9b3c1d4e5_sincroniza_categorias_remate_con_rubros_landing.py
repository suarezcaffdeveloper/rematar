"""sincroniza categorias remate con rubros landing

Las nueve categorías de `remate_category` se reemplazan por los rubros que expone la
landing pública. Ver ADR-013 y frontend/src/features/landing/data.ts::RUBROS.

Revision ID: f2a9b3c1d4e5
Revises: 120af802f614
Create Date: 2026-08-24 16:56:37.339468

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f2a9b3c1d4e5'
down_revision: Union[str, None] = 'e82c9b34d80a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Valores antiguos y nuevos del enum (los IDs se corresponden por posición para el
# backfill de datos: maquinaria_agricola -> maquinaria_pesada_y_agricola,
# arte_y_antiguedades -> arte_antiguedades_y_coleccionables, etc.).
OLD_CATEGORIES = [
    'inmuebles',
    'vehiculos',
    'maquinaria_agricola',
    'hacienda',
    'arte_y_antiguedades',
    'electronica',
    'mobiliario',
    'indumentaria',
    'otros',
]

NEW_CATEGORIES = [
    'inmuebles',
    'vehiculos',
    'maquinaria_pesada_y_agricola',
    'hacienda',
    'arte_antiguedades_y_coleccionables',
    'joyas_relojeria_y_numismatica',
    'tecnologia_electrodomesticos_y_hogar',
    'nautica_y_aviacion',
    'mercaderia_e_indumentaria',
]

# Mapeos explícitos para las categorías que cambian de significado.
CATEGORY_MAP: dict[str, str] = {
    'maquinaria_agricola': 'maquinaria_pesada_y_agricola',
    'arte_y_antiguedades': 'arte_antiguedades_y_coleccionables',
    'electronica': 'joyas_relojeria_y_numismatica',
    'mobiliario': 'tecnologia_electrodomesticos_y_hogar',
    'indumentaria': 'nautica_y_aviacion',
    'otros': 'mercaderia_e_indumentaria',
}


def upgrade() -> None:
    # Postgres no permite ALTER TYPE DROP VALUE ni cambiar el orden en la misma
    # transacción, así que recreamos el tipo. Renombramos el viejo, creamos el nuevo,
    # actualizamos las columnas y dropeamos el tipo renombrado.
    op.execute("ALTER TYPE remate_category RENAME TO remate_category_old")

    new_enum = sa.Enum(
        *NEW_CATEGORIES,
        name='remate_category',
        create_type=True,
    )
    new_enum.create(op.get_bind(), checkfirst=False)

    # Bajamos ambas columnas a texto plano primero: así el backfill de valores que
    # cambian de significado (ej. "otros") puede correr sin que el cast al enum nuevo
    # falle por valores que todavía no existen en `NEW_CATEGORIES`.
    op.execute("ALTER TABLE remates ALTER COLUMN category TYPE text USING category::text")
    op.execute("ALTER TABLE lotes ALTER COLUMN category TYPE text USING category::text")

    # Backfill de datos: reescribir los valores que migran a una categoría distinta.
    for old_value, new_value in CATEGORY_MAP.items():
        op.execute(
            sa.text(
                "UPDATE remates SET category = :new WHERE category = :old"
            ).bindparams(new=new_value, old=old_value)
        )
        op.execute(
            sa.text(
                "UPDATE lotes SET category = :new WHERE category = :old"
            ).bindparams(new=new_value, old=old_value)
        )

    # Ahora que todos los valores existen en `NEW_CATEGORIES`, casteamos al enum nuevo.
    op.execute(
        "ALTER TABLE remates ALTER COLUMN category "
        "TYPE remate_category USING category::remate_category"
    )
    op.execute(
        "ALTER TABLE lotes ALTER COLUMN category "
        "TYPE remate_category USING category::remate_category"
    )

    op.execute("DROP TYPE remate_category_old")


def downgrade() -> None:
    # Inversa: recreamos el enum antiguo y llevamos todo de vuelta.
    op.execute("ALTER TYPE remate_category RENAME TO remate_category_new")

    old_enum = sa.Enum(
        *OLD_CATEGORIES,
        name='remate_category',
        create_type=True,
    )
    old_enum.create(op.get_bind(), checkfirst=False)

    # Igual que en upgrade(): bajamos a texto plano antes del backfill para que los
    # valores nuevos (sin equivalente en el enum viejo todavía) no rompan el UPDATE.
    op.execute("ALTER TABLE remates ALTER COLUMN category TYPE text USING category::text")
    op.execute("ALTER TABLE lotes ALTER COLUMN category TYPE text USING category::text")

    # El reverso no es perfecto: categorías nuevas sin equivalente directo se agrupan
    # en "otros". Invertimos el mapa y añadimos un fallback.
    reverse_map: dict[str, str] = {v: k for k, v in CATEGORY_MAP.items()}

    for new_value, old_value in reverse_map.items():
        op.execute(
            sa.text(
                "UPDATE remates SET category = :old WHERE category = :new"
            ).bindparams(old=old_value, new=new_value)
        )
        op.execute(
            sa.text(
                "UPDATE lotes SET category = :old WHERE category = :new"
            ).bindparams(old=old_value, new=new_value)
        )

    # Cualquier categoría nueva sin mapeo reverso (si se insertó manualmente en el
    # intertanto) cae en 'otros' para que la conversión al enum antiguo no falle.
    op.execute(
        "UPDATE remates SET category = 'otros' "
        "WHERE category NOT IN (" + ", ".join(f"'{c}'" for c in OLD_CATEGORIES) + ")"
    )
    op.execute(
        "UPDATE lotes SET category = 'otros' "
        "WHERE category NOT IN (" + ", ".join(f"'{c}'" for c in OLD_CATEGORIES) + ")"
    )

    op.execute(
        "ALTER TABLE remates ALTER COLUMN category "
        "TYPE remate_category USING category::remate_category"
    )
    op.execute(
        "ALTER TABLE lotes ALTER COLUMN category "
        "TYPE remate_category USING category::remate_category"
    )

    op.execute("DROP TYPE remate_category_new")
