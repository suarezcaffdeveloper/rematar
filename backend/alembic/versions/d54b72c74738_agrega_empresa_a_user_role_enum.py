"""agrega empresa a user_role enum

Ver docs/adr/ADR-047-redefinicion-de-roles-empresa-rematador.md.

Revision ID: d54b72c74738
Revises: d4f7a2b9c1e3
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd54b72c74738'
down_revision: Union[str, None] = 'd4f7a2b9c1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres prohíbe usar un valor de enum nuevo en la misma transacción en la que se
    # agrega (por eso `autocommit_block`), y por la misma razón el backfill de datos
    # (migrar rematador -> empresa) va en una migración aparte que corre después de esta.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'empresa'")


def downgrade() -> None:
    # Postgres no soporta DROP VALUE de un enum -- revertir esto requeriría recrear el
    # tipo desde cero (rename + create + cast de la columna + drop), una operación manual
    # de DBA, no un downgrade automático. Ver ADR-010 y ADR-047 para el trade-off aceptado.
    pass
