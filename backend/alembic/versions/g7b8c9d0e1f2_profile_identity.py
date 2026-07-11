"""Profile identity uniqueness.

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-11

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    duplicates = sa.text(
        "DELETE FROM athlete_profiles WHERE id NOT IN "
        "(SELECT MIN(id) FROM athlete_profiles WHERE telegram_user_id IS NOT NULL GROUP BY telegram_user_id)"
    )
    op.execute(duplicates)
    op.create_index(
        "uq_athlete_profiles_telegram_user_id",
        "athlete_profiles",
        ["telegram_user_id"],
        unique=True,
        postgresql_where=sa.text("telegram_user_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_athlete_profiles_telegram_user_id", table_name="athlete_profiles")
