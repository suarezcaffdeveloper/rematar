"""documentos de venta adjudicada

Revision ID: 29b6eb4909e6
Revises: f2a9b3c1d4e5
Create Date: 2026-08-24 21:10:00.000000

`postauction_documents` (Épica 7, Módulo 7.5 -- continuación): el modelo
(`app/postauction/models.py::PostAuctionDocument`) ya existía desde la migración
50f830e27a57, pero sin tabla propia -- se agrega acá junto con el resto de la
funcionalidad (repository/service/router/frontend).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '29b6eb4909e6'
down_revision: Union[str, None] = 'f2a9b3c1d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'postauction_documents',
        sa.Column('case_id', sa.UUID(), nullable=False),
        sa.Column(
            'document_type',
            sa.Enum(
                'otro', 'recibo', 'factura', 'ticket', 'comprobante', 'contrato',
                'guia_envio', 'documento_entrega',
                name='postauction_document_type',
            ),
            nullable=False,
        ),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Numeric(precision=12, scale=0), nullable=False),
        sa.Column('url', sa.String(length=2048), nullable=False),
        sa.Column('uploaded_by_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['postauction_cases.id'], name=op.f('fk_postauction_documents_case_id_postauction_cases'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], name=op.f('fk_postauction_documents_uploaded_by_id_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_postauction_documents')),
    )
    op.create_index('ix_postauction_documents_case_id', 'postauction_documents', ['case_id'], unique=False)
    op.create_index('ix_postauction_documents_created_at', 'postauction_documents', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_postauction_documents_created_at', table_name='postauction_documents')
    op.drop_index('ix_postauction_documents_case_id', table_name='postauction_documents')
    op.drop_table('postauction_documents')
    # `op.drop_table` no dispara `DROP TYPE` para columnas ENUM (mismo motivo documentado
    # en 50f830e27a57 para `postauction_status`).
    postgresql.ENUM(name="postauction_document_type").drop(op.get_bind(), checkfirst=True)
