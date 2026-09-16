"""agrega expiry_warning_sent_at a garantias

`GarantiaExpiryScheduler` (Fase 6 del plan de Garantía Económica) necesita distinguir si
ya avisó al comprador que su garantía está por vencer -- sin esto, cada tick dentro de la
ventana de aviso (`GUARANTEE_EXPIRY_WARNING_HOURS`) mandaría una notificación nueva.

Revision ID: b1e1c2060320
Revises: df87311c1745
Create Date: 2026-09-16 14:33:14.779967

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b1e1c2060320'
down_revision: Union[str, None] = 'df87311c1745'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('garantias', sa.Column('expiry_warning_sent_at', sa.DateTime(timezone=True), nullable=True))
    # NOTA: autogenerate también detectó `bot_profiles`/`bot_remate_selections`/
    # `bot_simulation_runs` como "removidas" -- deriva preexistente ajena a esta
    # migración (ver la nota idéntica en df87311c1745). Se removieron esas sentencias a
    # mano otra vez.


def downgrade() -> None:
    op.drop_column('garantias', 'expiry_warning_sent_at')
