"""Weight is NULL or > 0: drop the -1 bodyweight sentinel.

Revision ID: l2b3c4d5e6f7
Revises: k1f2a3b4c5d6
Create Date: 2026-07-17
"""

from collections.abc import Sequence

from alembic import op

revision: str = "l2b3c4d5e6f7"
down_revision: str | None = "k1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE performed_sets SET weight = NULL WHERE weight <= 0")
    op.execute("UPDATE planned_exercises SET suggested_weight = NULL WHERE suggested_weight <= 0")
    # Legacy rows may hold a JSON scalar null instead of an array; normalize
    # them first — jsonb_array_elements refuses scalars.
    op.execute(
        """
        UPDATE planned_exercises SET set_targets = NULL
        WHERE set_targets IS NOT NULL AND jsonb_typeof(set_targets::jsonb) <> 'array'
        """
    )
    op.execute(
        """
        UPDATE planned_exercises SET set_targets = (
            SELECT json_agg(
                CASE WHEN (t->>'weight')::float <= 0 THEN jsonb_set(t, '{weight}', 'null')
                     ELSE t END
            )
            FROM jsonb_array_elements(set_targets::jsonb) AS t
        )
        WHERE set_targets IS NOT NULL AND set_targets::jsonb <> '[]'::jsonb
        """
    )
    op.create_check_constraint(
        "ck_set_weight_positive", "performed_sets", "weight IS NULL OR weight > 0"
    )
    op.create_check_constraint(
        "ck_planned_weight_positive",
        "planned_exercises",
        "suggested_weight IS NULL OR suggested_weight > 0",
    )


def downgrade() -> None:
    # The -1 sentinel is not restorable: which NULLs were bodyweight is now
    # derived from exercise equipment, so only the constraints are reverted.
    op.drop_constraint("ck_planned_weight_positive", "planned_exercises", type_="check")
    op.drop_constraint("ck_set_weight_positive", "performed_sets", type_="check")
