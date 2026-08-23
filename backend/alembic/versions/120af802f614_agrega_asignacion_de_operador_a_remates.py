"""agrega asignacion de operador a remates

Ver docs/adr/ADR-048-asignacion-de-operador-via-codigo.md.

Revision ID: 120af802f614
Revises: 80a303b424a7
Create Date: 2026-08-21 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '120af802f614'
down_revision: Union[str, None] = '80a303b424a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'remates',
        sa.Column('rematador_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column('remates', sa.Column('operator_code_hash', sa.String(length=64), nullable=True))
    op.add_column(
        'remates',
        sa.Column('operator_code_generated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_remates_rematador_id', 'remates', ['rematador_id'])
    op.create_foreign_key(
        'fk_remates_rematador_id_users',
        'remates',
        'users',
        ['rematador_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_remates_rematador_id_users', 'remates', type_='foreignkey')
    op.drop_index('ix_remates_rematador_id', table_name='remates')
    op.drop_column('remates', 'operator_code_generated_at')
    op.drop_column('remates', 'operator_code_hash')
    op.drop_column('remates', 'rematador_id')
