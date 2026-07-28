"""Mark planned exercises whose load is unilateral.

Revision ID: m3c4d5e6f7g8
Revises: l2b3c4d5e6f7
"""

import sqlalchemy as sa
from alembic import op

revision = "m3c4d5e6f7g8"
down_revision = "l2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planned_exercises",
        sa.Column("unilateral", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("planned_exercises", "unilateral", server_default=None)


def downgrade() -> None:
    op.drop_column("planned_exercises", "unilateral")
