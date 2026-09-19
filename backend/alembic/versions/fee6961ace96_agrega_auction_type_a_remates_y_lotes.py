"""agrega auction_type (LIVE/TIMED) a remates y lotes

Nueva modalidad de remate: `Remate.auction_type` (`RemateAuctionType`: live/timed) --
inmutable después de crear, mismo tratamiento que `access_type` (eje ortogonal a él).
`Lote.auction_type` es una copia denormalizada e inmutable del `auction_type` del remate
padre al momento de crear el lote (mismo patrón que `Lote.category` reutilizando el enum
`remate_category`, ver ADR-014) -- existe únicamente para que el índice único parcial
que impone RF-12 (`uq_lotes_remate_id_open_status`, ver ADR-017) pueda acotarse a
`auction_type = 'live'` sin un JOIN (un índice parcial de Postgres solo puede referenciar
columnas de su propia tabla). Con esto, un remate TIMED permite que todos sus lotes
estén `OPEN` a la vez (pujas paralelas, spec de Timed Auctions); un remate LIVE conserva
el invariante de "a lo sumo un lote abierto" exactamente como antes -- ADR-017 ya
anticipaba textualmente que permitir pujas paralelas exigiría tocar este índice.

Revision ID: fee6961ace96
Revises: f3543be80d2d
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fee6961ace96'
down_revision: Union[str, None] = 'f3543be80d2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    remate_auction_type = postgresql.ENUM('live', 'timed', name='remate_auction_type')
    remate_auction_type.create(op.get_bind())

    op.add_column(
        'remates',
        sa.Column(
            'auction_type',
            remate_auction_type,
            nullable=False,
            server_default='live',
        ),
    )
    # server_default solo para backfillar las filas existentes; en adelante el default
    # vive del lado de Python (Remate.auction_type / RemateCreate.auction_type), mismo
    # criterio que access_type/status.
    op.alter_column('remates', 'auction_type', server_default=None)
    op.create_index(
        'ix_remates_auction_type_status', 'remates', ['auction_type', 'status']
    )

    lote_auction_type = postgresql.ENUM(
        'live', 'timed', name='remate_auction_type', create_type=False
    )
    op.add_column(
        'lotes',
        sa.Column(
            'auction_type',
            lote_auction_type,
            nullable=False,
            server_default='live',
        ),
    )
    op.alter_column('lotes', 'auction_type', server_default=None)

    # RF-12/ADR-017: acota el invariante de "a lo sumo un lote OPEN por remate" a
    # remates LIVE -- ver docstring de esta migración y de `Lote.__table_args__`.
    op.drop_index('uq_lotes_remate_id_open_status', table_name='lotes')
    op.create_index(
        'uq_lotes_remate_id_open_status',
        'lotes',
        ['remate_id'],
        unique=True,
        postgresql_where=sa.text(
            "status = 'open' AND deleted_at IS NULL AND auction_type = 'live'"
        ),
    )


def downgrade() -> None:
    op.drop_index('uq_lotes_remate_id_open_status', table_name='lotes')
    op.create_index(
        'uq_lotes_remate_id_open_status',
        'lotes',
        ['remate_id'],
        unique=True,
        postgresql_where=sa.text("status = 'open' AND deleted_at IS NULL"),
    )
    op.drop_column('lotes', 'auction_type')
    op.drop_index('ix_remates_auction_type_status', table_name='remates')
    op.drop_column('remates', 'auction_type')
    postgresql.ENUM(name='remate_auction_type').drop(op.get_bind())
