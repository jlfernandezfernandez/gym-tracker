"""drop unused profile fields

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("athlete_profiles", "training_days_per_week")
    op.drop_column("athlete_profiles", "usual_session_minutes")
    op.drop_column("athlete_profiles", "injuries")
    op.drop_column("athlete_profiles", "limitations")
    op.drop_column("athlete_profiles", "gym_name")
    op.drop_column("athlete_profiles", "available_equipment")
    op.drop_column("athlete_profiles", "unavailable_equipment")
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
    op.add_column("athlete_profiles", sa.Column("unavailable_equipment", sa.String(), nullable=False, server_default=""))
    op.add_column("athlete_profiles", sa.Column("available_equipment", sa.String(), nullable=False, server_default=""))
    op.add_column("athlete_profiles", sa.Column("gym_name", sa.String(), nullable=False, server_default=""))
    op.add_column("athlete_profiles", sa.Column("usual_session_minutes", sa.Integer(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("training_days_per_week", sa.Integer(), nullable=True))
    op.add_column("athlete_profiles", sa.Column("limitations", sa.String(), nullable=False, server_default=""))
    op.add_column("athlete_profiles", sa.Column("injuries", sa.String(), nullable=False, server_default=""))
