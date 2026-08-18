"""agrega avatar_url a usuarios

Revision ID: 83ae3372b284
Revises: b2c4f8a913de
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83ae3372b284'
down_revision: Union[str, None] = 'b2c4f8a913de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: los usuarios existentes quedan con avatar_url = NULL (avatar por
    # defecto, iniciales) -- mismo criterio que la migración de `phone`
    # (ac12a16efa0b), sin backfill.
    op.add_column('users', sa.Column('avatar_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_url')
