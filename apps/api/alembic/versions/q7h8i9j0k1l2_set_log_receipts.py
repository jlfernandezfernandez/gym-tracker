"""Retain idempotent set logging receipts, including after set deletion."""

import sqlalchemy as sa

from alembic import op

revision = "q7h8i9j0k1l2"
down_revision = "p6g7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "set_log_receipts",
        sa.Column("request_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("planned_exercise_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("performed_set_id", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("request_id", name="pk_set_log_receipts"),
        sa.ForeignKeyConstraint(["session_id"], ["workout_sessions.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("set_log_receipts")
