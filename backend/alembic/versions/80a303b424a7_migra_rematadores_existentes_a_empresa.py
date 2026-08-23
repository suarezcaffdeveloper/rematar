"""migra rematadores existentes a empresa

Todo usuario con role='rematador' hacía, hasta ADR-047, exactamente lo que pasa a ser
la responsabilidad de 'empresa' (crear/publicar remates, fijar precios, postventa).
Por eso se migran sus cuentas a 'empresa' en bloque; 'rematador' queda vacío hasta que
alguna empresa asigne ese rol a un operador vía código (ver Fase 1 del plan de roles).

Revision ID: 80a303b424a7
Revises: d54b72c74738
Create Date: 2026-08-21 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '80a303b424a7'
down_revision: Union[str, None] = 'd54b72c74738'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'empresa' WHERE role = 'rematador'")


def downgrade() -> None:
    # Simétrico: antes de esta migración no existía 'empresa' como concepto separado,
    # así que revertir es simplemente devolver esas cuentas a 'rematador'.
    op.execute("UPDATE users SET role = 'rematador' WHERE role = 'empresa'")
