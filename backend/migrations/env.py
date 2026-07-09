"""Alembic environment."""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import models  # noqa: F401 — populate metadata
from sqlmodel import SQLModel

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _sync_url() -> str:
    """Alembic runs sync; convert the async URL the app uses to a sync one."""
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/gym_tracker")
    return url.replace("postgresql+asyncpg://", "postgresql://")


target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=_sync_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = {"sqlalchemy.url": _sync_url()}
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()