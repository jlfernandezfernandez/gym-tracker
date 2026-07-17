"""add disliked exercises table and drop legacy text column

Revision ID: j0e1f2a3b4c5
Revises: i9d0e1f2a3b4
"""

import sqlalchemy as sa

from alembic import op

revision: str = "j0e1f2a3b4c5"
down_revision: str | None = "i9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_disliked_exercises",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athlete_profiles.id"), nullable=False),
        sa.Column("exercise_id", sa.Integer(), sa.ForeignKey("exercises.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("athlete_id", "exercise_id", name="uq_disliked_athlete_exercise"),
    )
    op.create_index("ix_disliked_athlete_id", "athlete_disliked_exercises", ["athlete_id"])
    op.drop_column("athlete_profiles", "disliked_exercises")


def downgrade() -> None:
    op.add_column(
        "athlete_profiles",
        sa.Column("disliked_exercises", sa.String(), nullable=False, server_default=""),
    )
    op.drop_index("ix_disliked_athlete_id", table_name="athlete_disliked_exercises")
    op.drop_table("athlete_disliked_exercises")
