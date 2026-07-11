"""normalize bodyweight sentinel

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE planned_exercises AS planned
        SET suggested_weight = -1
        FROM exercises
        WHERE planned.exercise_id = exercises.id
          AND exercises.equipment = 'body weight'
    """)
    op.execute("""
        UPDATE performed_sets AS performed
        SET weight = -1
        FROM planned_exercises AS planned, exercises
        WHERE performed.planned_exercise_id = planned.id
          AND planned.exercise_id = exercises.id
          AND exercises.equipment = 'body weight'
    """)


def downgrade() -> None:
    pass
