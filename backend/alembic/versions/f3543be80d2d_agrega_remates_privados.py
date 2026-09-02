"""agrega remates privados

Remate gana access_type (public/private) + el par private_access_code_encrypted/
private_access_code_generated_at -- a diferencia de operator_code_hash (120af802f614),
cifrado reversible en vez de hash, para que el dueño pueda volver a ver el código
actual sin regenerarlo (ver app/core/crypto.py). Nueva tabla remate_access_grants:
acceso persistente por (remate_id, user_id) para un comprador que canjeó el código de
un remate privado -- ver RemateService.redeem_private_access.

Revision ID: f3543be80d2d
Revises: 29b6eb4909e6
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f3543be80d2d'
down_revision: Union[str, None] = '29b6eb4909e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    remate_access_type = postgresql.ENUM('public', 'private', name='remate_access_type')
    remate_access_type.create(op.get_bind())

    op.add_column(
        'remates',
        sa.Column(
            'access_type',
            remate_access_type,
            nullable=False,
            server_default='public',
        ),
    )
    # server_default solo para backfillar las filas existentes; en adelante el default
    # vive del lado de Python (Remate.access_type / RemateCreate.access_type), mismo
    # criterio que RemateStatus.status.
    op.alter_column('remates', 'access_type', server_default=None)
    op.add_column(
        'remates',
        sa.Column('private_access_code_encrypted', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'remates',
        sa.Column('private_access_code_generated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'remate_access_grants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('remate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ['remate_id'],
            ['remates.id'],
            name='fk_remate_access_grants_remate_id_remates',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_remate_access_grants_user_id_users',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'remate_id', 'user_id', name='uq_remate_access_grants_remate_id_user_id'
        ),
    )
    op.create_index(
        'ix_remate_access_grants_remate_id', 'remate_access_grants', ['remate_id']
    )
    op.create_index('ix_remate_access_grants_user_id', 'remate_access_grants', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_remate_access_grants_user_id', table_name='remate_access_grants')
    op.drop_index('ix_remate_access_grants_remate_id', table_name='remate_access_grants')
    op.drop_table('remate_access_grants')
    op.drop_column('remates', 'private_access_code_generated_at')
    op.drop_column('remates', 'private_access_code_encrypted')
    op.drop_column('remates', 'access_type')
    postgresql.ENUM(name='remate_access_type').drop(op.get_bind())
