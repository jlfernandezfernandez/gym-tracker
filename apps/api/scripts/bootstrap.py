import asyncio
import subprocess
import sys

from app.core.config import get_settings
from app.core.database import _get_async_session
from app.features.exercises.catalog import install_dataset


def run() -> None:
    settings = get_settings()
    # The alembic/ migrations directory shadows the alembic package when the
    # project root is on sys.path, so migrations run through the CLI instead.
    if subprocess.run(["alembic", "upgrade", "head"]).returncode != 0:
        print("Migration failed", file=sys.stderr)
        sys.exit(1)

    async def _seed() -> None:
        session_factory = _get_async_session()
        async with session_factory() as db:
            try:
                result = await install_dataset(db, settings)
                await db.commit()
                if result.skipped:
                    print(f"Dataset {settings.exercise_dataset_version} already installed")
                else:
                    print(
                        f"Dataset {settings.exercise_dataset_version}: {result.added} added, "
                        f"{result.updated} updated, {result.media_installed} media installed"
                    )
            except Exception as e:
                await db.rollback()
                print(f"Seed failed: {e}", file=sys.stderr)
                raise

    asyncio.run(_seed())


if __name__ == "__main__":
    run()
