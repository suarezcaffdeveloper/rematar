"""lotes desiertos: reincorporacion a la cola (round_number + lote_rounds)

Revision ID: ef8e3d58bba0
Revises: ac12a16efa0b
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'ef8e3d58bba0'
down_revision: Union[str, None] = 'ac12a16efa0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Módulo de lotes desiertos: reincorporación a la cola. `round_number` es NOT NULL
    # -- necesita `server_default` para que los lotes ya existentes queden en la ronda 1
    # (mismo valor que el default de Python, que solo rige para filas nuevas).
    op.add_column(
        'lotes',
        sa.Column('round_number', sa.Integer(), server_default=sa.text('1'), nullable=False),
    )

    op.create_table(
        'lote_rounds',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lote_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('round_number', sa.Integer(), nullable=False),
        sa.Column('base_price', sa.Numeric(14, 2), nullable=False),
        sa.Column('min_increment', sa.Numeric(14, 2), nullable=False),
        sa.Column('reserve_price', sa.Numeric(14, 2), nullable=True),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('requeued_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('requeued_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('requeued_by_name', sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(['lote_id'], ['lotes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requeued_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_lote_rounds_lote_id_round_number', 'lote_rounds', ['lote_id', 'round_number'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_lote_rounds_lote_id_round_number', table_name='lote_rounds')
    op.drop_table('lote_rounds')
    op.drop_column('lotes', 'round_number')
