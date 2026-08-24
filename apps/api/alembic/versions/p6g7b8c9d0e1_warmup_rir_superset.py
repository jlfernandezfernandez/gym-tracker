"""Add warmup flag, RIR, and superset group columns.

Revision ID: p6g7b8c9d0e1
Revises: o5f6a7b8c9d0
"""

import sqlalchemy as sa

from alembic import op

revision = "p6g7b8c9d0e1"
down_revision = "o5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "performed_sets",
        sa.Column("is_warmup", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("performed_sets", sa.Column("rir", sa.Float(), nullable=True))
    op.add_column("planned_exercises", sa.Column("superset_group", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("planned_exercises", "superset_group")
    op.drop_column("performed_sets", "rir")
    op.drop_column("performed_sets", "is_warmup")
