"""Add explicit execution_metric and duration_seconds for timed strength.

Existing planned exercises keep their historical contract:
- cardio -> duration_minutes
- strength -> reps
"""

import sqlalchemy as sa

from alembic import op

revision = "r8i9j0k1l2m3"
down_revision = "q7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planned_exercises",
        sa.Column("execution_metric", sa.String(), nullable=True),
    )
    op.add_column(
        "planned_exercises",
        sa.Column("target_duration_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "performed_sets",
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
    )

    op.execute(
        """
        UPDATE planned_exercises AS planned
        SET execution_metric = CASE
            WHEN exercise.activity_type = 'cardio' THEN 'duration_minutes'
            ELSE 'reps'
        END
        FROM exercises AS exercise
        WHERE exercise.id = planned.exercise_id
        """
    )
    op.alter_column("planned_exercises", "execution_metric", nullable=False)

    op.create_check_constraint(
        "ck_planned_duration_seconds_positive",
        "planned_exercises",
        "target_duration_seconds IS NULL OR target_duration_seconds > 0",
    )
    op.create_check_constraint(
        "ck_planned_execution_metric",
        "planned_exercises",
        "execution_metric IN ('reps', 'duration_minutes', 'duration_seconds')",
    )
    op.create_check_constraint(
        "ck_planned_target_matches_metric",
        "planned_exercises",
        "(execution_metric != 'reps' OR (target_duration_minutes IS NULL"
        " AND target_duration_seconds IS NULL))"
        " AND (execution_metric != 'duration_minutes' OR (target_reps IS NULL"
        " AND target_duration_seconds IS NULL))"
        " AND (execution_metric != 'duration_seconds' OR (target_reps IS NULL"
        " AND target_duration_minutes IS NULL))",
    )

    op.create_check_constraint(
        "ck_set_duration_seconds_positive",
        "performed_sets",
        "duration_seconds IS NULL OR duration_seconds > 0",
    )
    op.drop_constraint("ck_set_metric_exactly_one", "performed_sets", type_="check")
    op.create_check_constraint(
        "ck_set_metric_exactly_one",
        "performed_sets",
        "(CASE WHEN reps IS NOT NULL THEN 1 ELSE 0 END)"
        " + (CASE WHEN duration_minutes IS NOT NULL THEN 1 ELSE 0 END)"
        " + (CASE WHEN duration_seconds IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_set_metric_exactly_one", "performed_sets", type_="check")
    op.create_check_constraint(
        "ck_set_metric_exactly_one",
        "performed_sets",
        "(reps IS NULL) <> (duration_minutes IS NULL)",
    )
    op.drop_constraint("ck_set_duration_seconds_positive", "performed_sets", type_="check")

    op.drop_constraint("ck_planned_target_matches_metric", "planned_exercises", type_="check")
    op.drop_constraint("ck_planned_execution_metric", "planned_exercises", type_="check")
    op.drop_constraint("ck_planned_duration_seconds_positive", "planned_exercises", type_="check")

    op.drop_column("performed_sets", "duration_seconds")
    op.drop_column("planned_exercises", "target_duration_seconds")
    op.drop_column("planned_exercises", "execution_metric")
