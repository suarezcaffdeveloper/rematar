"""create bot_profiles, bot_remate_selections and bot_simulation_runs tables

Revision ID: b2c4f8a913de
Revises: ef8e3d58bba0
Create Date: 2026-08-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b2c4f8a913de'
down_revision: Union[str, None] = 'ef8e3d58bba0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bot_profiles',
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column(
            'personality',
            sa.Enum('conservative', 'competitive', 'aggressive', name='bot_personality'),
            nullable=False,
        ),
        sa.Column('max_budget', sa.Numeric(14, 2), nullable=False),
        sa.Column('reaction_delay_min_seconds', sa.Integer(), nullable=False),
        sa.Column('reaction_delay_max_seconds', sa.Integer(), nullable=False),
        sa.Column('continue_probability', sa.Numeric(3, 2), nullable=False),
        sa.Column('participates_in_chat', sa.Boolean(), nullable=False),
        sa.Column('chat_message_frequency', sa.Numeric(3, 2), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('max_budget > 0', name=op.f('ck_bot_profiles_max_budget_positive')),
        sa.CheckConstraint(
            'reaction_delay_min_seconds > 0',
            name=op.f('ck_bot_profiles_reaction_delay_min_seconds_positive'),
        ),
        sa.CheckConstraint(
            'reaction_delay_max_seconds >= reaction_delay_min_seconds',
            name=op.f('ck_bot_profiles_reaction_delay_max_gte_min'),
        ),
        sa.CheckConstraint(
            'continue_probability >= 0 AND continue_probability <= 1',
            name=op.f('ck_bot_profiles_continue_probability_between_0_and_1'),
        ),
        sa.CheckConstraint(
            'chat_message_frequency >= 0 AND chat_message_frequency <= 1',
            name=op.f('ck_bot_profiles_chat_message_frequency_between_0_and_1'),
        ),
        sa.ForeignKeyConstraint(
            ['created_by_id'], ['users.id'],
            name=op.f('fk_bot_profiles_created_by_id_users'), ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'],
            name=op.f('fk_bot_profiles_user_id_users'), ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_bot_profiles')),
        sa.UniqueConstraint('user_id', name=op.f('uq_bot_profiles_user_id')),
    )
    op.create_index(op.f('ix_bot_profiles_created_by_id'), 'bot_profiles', ['created_by_id'], unique=False)

    op.create_table(
        'bot_remate_selections',
        sa.Column('remate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('bot_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['remate_id'], ['remates.id'],
            name=op.f('fk_bot_remate_selections_remate_id_remates'), ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['bot_profile_id'], ['bot_profiles.id'],
            name=op.f('fk_bot_remate_selections_bot_profile_id_bot_profiles'), ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_bot_remate_selections')),
        sa.UniqueConstraint(
            'remate_id', 'bot_profile_id',
            name='uq_bot_remate_selections_remate_id_bot_profile_id',
        ),
    )
    op.create_index(
        op.f('ix_bot_remate_selections_remate_id'), 'bot_remate_selections', ['remate_id'], unique=False
    )
    op.create_index(
        op.f('ix_bot_remate_selections_bot_profile_id'),
        'bot_remate_selections', ['bot_profile_id'], unique=False,
    )

    op.create_table(
        'bot_simulation_runs',
        sa.Column('remate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'status',
            sa.Enum('running', 'paused', 'stopped', name='bot_simulation_status'),
            nullable=False,
        ),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('stop_reason', sa.String(length=100), nullable=True),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['remate_id'], ['remates.id'],
            name=op.f('fk_bot_simulation_runs_remate_id_remates'), ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['started_by_id'], ['users.id'],
            name=op.f('fk_bot_simulation_runs_started_by_id_users'), ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_bot_simulation_runs')),
        sa.UniqueConstraint('remate_id', name=op.f('uq_bot_simulation_runs_remate_id')),
    )


def downgrade() -> None:
    op.drop_table('bot_simulation_runs')
    postgresql.ENUM(name='bot_simulation_status').drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f('ix_bot_remate_selections_bot_profile_id'), table_name='bot_remate_selections')
    op.drop_index(op.f('ix_bot_remate_selections_remate_id'), table_name='bot_remate_selections')
    op.drop_table('bot_remate_selections')

    op.drop_index(op.f('ix_bot_profiles_created_by_id'), table_name='bot_profiles')
    op.drop_table('bot_profiles')
    postgresql.ENUM(name='bot_personality').drop(op.get_bind(), checkfirst=True)
