"""enforce workout session integrity

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `changed` used to be a transient UI status; it is not a terminal state.
    op.execute("UPDATE planned_exercises SET status = 'pending' WHERE status = 'changed'")
    op.create_unique_constraint(
        "uq_performed_set_number", "performed_sets", ["planned_exercise_id", "set_number"]
    )
    op.create_unique_constraint(
        "uq_planned_exercise_order", "planned_exercises", ["session_id", "order"]
    )
    op.create_check_constraint(
        "ck_session_status",
        "workout_sessions",
        "status IN ('planned', 'in_progress', 'completed', 'cancelled')",
    )
    op.create_check_constraint(
        "ck_planned_status",
        "planned_exercises",
        "status IN ('pending', 'in_progress', 'completed', 'skipped')",
    )
    op.create_check_constraint("ck_planned_target_sets", "planned_exercises", "target_sets > 0")
    op.create_check_constraint("ck_planned_target_reps", "planned_exercises", "target_reps > 0")


def downgrade() -> None:
    op.drop_constraint("ck_planned_target_reps", "planned_exercises", type_="check")
    op.drop_constraint("ck_planned_target_sets", "planned_exercises", type_="check")
    op.drop_constraint("ck_planned_status", "planned_exercises", type_="check")
    op.drop_constraint("ck_session_status", "workout_sessions", type_="check")
    op.drop_constraint("uq_planned_exercise_order", "planned_exercises", type_="unique")
    op.drop_constraint("uq_performed_set_number", "performed_sets", type_="unique")
