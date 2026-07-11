"""add bilingual exercise names

Revision ID: a1b2c3d4e5f6
Revises: 8fcbeeb914f4
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "8fcbeeb914f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exercises", sa.Column("name_en", sa.String(), nullable=True))
    op.add_column("exercises", sa.Column("name_es", sa.String(), nullable=True))
    op.execute(sa.text("UPDATE exercises SET name_en = name, name_es = name WHERE name_en IS NULL"))
    op.alter_column("exercises", "name_en", nullable=False)
    op.alter_column("exercises", "name_es", nullable=False)
    op.create_index("ix_exercises_name_en", "exercises", ["name_en"], unique=False)
    op.create_index("ix_exercises_name_es", "exercises", ["name_es"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_exercises_name_es", table_name="exercises")
    op.drop_index("ix_exercises_name_en", table_name="exercises")
    op.drop_column("exercises", "name_es")
    op.drop_column("exercises", "name_en")
