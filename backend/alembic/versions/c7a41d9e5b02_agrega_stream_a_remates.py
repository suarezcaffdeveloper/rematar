"""agrega transmision en vivo (stream_provider, stream_video_id) a remates

Revision ID: c7a41d9e5b02
Revises: b1e1c2060320
Create Date: 2026-09-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7a41d9e5b02'
down_revision: Union[str, None] = 'b1e1c2060320'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('remates', sa.Column('stream_provider', sa.String(length=20), nullable=True))
    op.add_column('remates', sa.Column('stream_video_id', sa.String(length=11), nullable=True))


def downgrade() -> None:
    op.drop_column('remates', 'stream_video_id')
    op.drop_column('remates', 'stream_provider')
