"""Add explicit cardio activity and duration metrics.

Revision ID: o5f6a7b8c9d0
Revises: n4e5f6a7b8c9
"""

import sqlalchemy as sa

from alembic import op

revision = "o5f6a7b8c9d0"
down_revision = "n4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("activity_type", sa.String(), nullable=False, server_default="strength"),
    )
    op.execute(
        """
        UPDATE exercises
        SET activity_type = 'cardio'
        WHERE body_part = 'cardio' OR muscle_group = 'cardiovascular'
        """
    )
    op.alter_column("exercises", "activity_type", server_default=None)
    op.create_index("ix_exercises_activity_type", "exercises", ["activity_type"])
    op.create_check_constraint(
        "ck_exercise_activity_type",
        "exercises",
        "activity_type IN ('strength', 'cardio')",
    )

    op.add_column(
        "planned_exercises",
        sa.Column("target_duration_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "performed_sets",
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
    )
    op.alter_column("planned_exercises", "target_reps", nullable=True)
    op.alter_column("performed_sets", "reps", nullable=True)

    op.execute(
        """
        UPDATE planned_exercises AS planned
        SET target_duration_minutes = planned.target_reps,
            target_reps = NULL,
            suggested_weight = NULL,
            unilateral = false
        FROM exercises AS exercise
        WHERE planned.exercise_id = exercise.id
          AND exercise.activity_type = 'cardio'
        """
    )
    op.execute(
        """
        UPDATE performed_sets AS performed
        SET duration_minutes = performed.reps,
            reps = NULL,
            weight = NULL
        FROM planned_exercises AS planned
        JOIN exercises AS exercise ON exercise.id = planned.exercise_id
        WHERE performed.planned_exercise_id = planned.id
          AND exercise.activity_type = 'cardio'
        """
    )
    op.execute(
        """
        UPDATE planned_exercises AS planned
        SET set_targets = (
            SELECT jsonb_agg(
                (target - 'reps' - 'weight')
                || jsonb_build_object('duration_minutes', (target ->> 'reps')::integer)
                ORDER BY (target ->> 'set_number')::integer
            )
            FROM jsonb_array_elements(planned.set_targets::jsonb) AS target
        )
        FROM exercises AS exercise
        WHERE planned.exercise_id = exercise.id
          AND exercise.activity_type = 'cardio'
          AND planned.set_targets IS NOT NULL
        """
    )

    op.drop_constraint("ck_planned_target_reps", "planned_exercises", type_="check")
    op.create_check_constraint(
        "ck_planned_target_reps",
        "planned_exercises",
        "target_reps IS NULL OR target_reps > 0",
    )
    op.create_check_constraint(
        "ck_planned_duration_positive",
        "planned_exercises",
        "target_duration_minutes IS NULL OR target_duration_minutes > 0",
    )

    op.create_check_constraint(
        "ck_set_reps_positive",
        "performed_sets",
        "reps IS NULL OR reps > 0",
    )
    op.create_check_constraint(
        "ck_set_duration_positive",
        "performed_sets",
        "duration_minutes IS NULL OR duration_minutes > 0",
    )
    op.create_check_constraint(
        "ck_set_metric_exactly_one",
        "performed_sets",
        "(reps IS NULL) <> (duration_minutes IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_set_metric_exactly_one", "performed_sets", type_="check")
    op.drop_constraint("ck_set_duration_positive", "performed_sets", type_="check")
    op.drop_constraint("ck_set_reps_positive", "performed_sets", type_="check")

    op.drop_constraint("ck_planned_duration_positive", "planned_exercises", type_="check")
    op.drop_constraint("ck_planned_target_reps", "planned_exercises", type_="check")

    op.execute(
        """
        UPDATE planned_exercises
        SET target_reps = target_duration_minutes
        WHERE target_reps IS NULL
        """
    )
    op.execute(
        """
        UPDATE performed_sets
        SET reps = duration_minutes
        WHERE reps IS NULL
        """
    )
    op.execute(
        """
        UPDATE planned_exercises
        SET set_targets = (
            SELECT jsonb_agg(
                (target - 'duration_minutes')
                || jsonb_build_object(
                    'weight', NULL,
                    'reps', (target ->> 'duration_minutes')::integer
                )
                ORDER BY (target ->> 'set_number')::integer
            )
            FROM jsonb_array_elements(set_targets::jsonb) AS target
        )
        WHERE set_targets IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(set_targets::jsonb) AS target
              WHERE target ? 'duration_minutes'
          )
        """
    )

    op.alter_column("performed_sets", "reps", nullable=False)
    op.alter_column("planned_exercises", "target_reps", nullable=False)
    op.create_check_constraint("ck_planned_target_reps", "planned_exercises", "target_reps > 0")
    op.drop_column("performed_sets", "duration_minutes")
    op.drop_column("planned_exercises", "target_duration_minutes")
    op.drop_constraint("ck_exercise_activity_type", "exercises", type_="check")
    op.drop_index("ix_exercises_activity_type", table_name="exercises")
    op.drop_column("exercises", "activity_type")
