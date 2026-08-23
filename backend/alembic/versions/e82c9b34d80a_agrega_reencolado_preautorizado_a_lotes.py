"""agrega reencolado preautorizado a lotes

Ver docs/adr/ADR-048-asignacion-de-operador-via-codigo.md.

Revision ID: e82c9b34d80a
Revises: 120af802f614
Create Date: 2026-08-21 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e82c9b34d80a'
down_revision: Union[str, None] = '120af802f614'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'lotes',
        sa.Column(
            'requeue_preset_enabled', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        'lotes', sa.Column('requeue_preset_base_price', sa.Numeric(14, 2), nullable=True)
    )
    op.add_column(
        'lotes', sa.Column('requeue_preset_min_increment', sa.Numeric(14, 2), nullable=True)
    )
    op.create_check_constraint(
        op.f('ck_lotes_requeue_preset_requires_price'),
        'lotes',
        "requeue_preset_enabled = false OR "
        "(requeue_preset_base_price IS NOT NULL AND requeue_preset_min_increment IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f('ck_lotes_requeue_preset_requires_price'), 'lotes', type_='check')
    op.drop_column('lotes', 'requeue_preset_min_increment')
    op.drop_column('lotes', 'requeue_preset_base_price')
    op.drop_column('lotes', 'requeue_preset_enabled')
