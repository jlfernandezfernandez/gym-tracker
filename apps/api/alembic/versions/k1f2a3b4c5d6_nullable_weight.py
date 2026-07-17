"""Nullable weight for unloaded exercises.

Revision ID: k1f2a3b4c5d6
Revises: j0e1f2a3b4c5
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "k1f2a3b4c5d6"
down_revision: str | None = "j0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop NOT NULL before writing NULLs, or the UPDATE itself is rejected.
    op.alter_column("performed_sets", "weight", existing_type=sa.Float(), nullable=True)
    op.execute("UPDATE performed_sets SET weight = NULL WHERE weight = 0.0")

    op.alter_column(
        "planned_exercises", "suggested_weight", existing_type=sa.Float(), nullable=True
    )
    op.execute("UPDATE planned_exercises SET suggested_weight = NULL WHERE suggested_weight = 0.0")


def downgrade() -> None:
    op.execute("UPDATE performed_sets SET weight = 0.0 WHERE weight IS NULL")
    op.alter_column("performed_sets", "weight", existing_type=sa.Float(), nullable=False)

    op.execute("UPDATE planned_exercises SET suggested_weight = 0.0 WHERE suggested_weight IS NULL")
    op.alter_column(
        "planned_exercises", "suggested_weight", existing_type=sa.Float(), nullable=False
    )
