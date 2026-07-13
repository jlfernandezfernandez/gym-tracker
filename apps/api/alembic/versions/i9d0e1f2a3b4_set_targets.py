"""Per-set weight/reps targets for planned exercises.

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
Create Date: 2026-07-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "i9d0e1f2a3b4"
down_revision: str | None = "h8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "planned_exercises",
        sa.Column("set_targets", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planned_exercises", "set_targets")
