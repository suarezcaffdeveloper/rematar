"""agrega telefono a usuarios

Revision ID: ac12a16efa0b
Revises: ba429957efa3
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac12a16efa0b'
down_revision: Union[str, None] = 'ba429957efa3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: los usuarios existentes quedan con phone = NULL, sin backfill. El
    # registro público (UserCreate) ya lo exige para cuentas nuevas -- ver
    # app/modules/users/schemas.py.
    op.add_column('users', sa.Column('phone', sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'phone')
