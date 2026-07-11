import asyncio
import sys

from alembic.config import Config

from alembic import command
from app.config import get_settings
from app.database import _get_async_session
from app.services.exercise_catalog import sync_exercise_catalog
from app.storage.s3 import get_storage


def run() -> None:
    settings = get_settings()
    alembic_cfg = Config("alembic.ini")
    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as e:
        print(f"Migration failed: {e}", file=sys.stderr)
        sys.exit(1)

    storage = get_storage()
    try:
        storage.head_bucket()
    except Exception:
        try:
            storage.client.create_bucket(Bucket=storage.bucket)
        except Exception as e:
            print(f"Bucket creation failed: {e}", file=sys.stderr)
            sys.exit(1)

    async def _seed() -> None:
        session_factory = _get_async_session()
        async with session_factory() as db:
            try:
                result = await sync_exercise_catalog(db, storage, settings)
                await db.commit()
                print(
                    f"Seeded: {result.added} added, {result.updated} updated, "
                    f"{result.media_uploaded} media uploaded"
                )
            except Exception as e:
                await db.rollback()
                print(f"Seed failed: {e}", file=sys.stderr)
                sys.exit(1)

    asyncio.run(_seed())


if __name__ == "__main__":
    run()
