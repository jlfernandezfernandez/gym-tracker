"""drop unused measurement column (score)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""

import sqlalchemy as sa

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("athlete_measurements", "score")


def downgrade() -> None:
    op.add_column("athlete_measurements", sa.Column("score", sa.Float(), nullable=True))
