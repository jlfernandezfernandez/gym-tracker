import asyncio
import sys
import time

from alembic.config import Config

from alembic import command
from app.config import get_settings
from app.database import _get_async_session
from app.services.exercise_catalog import sync_exercise_catalog
from app.storage.s3 import S3Storage, get_storage


def ensure_bucket(storage: S3Storage, attempts: int = 30, delay: float = 2.0) -> None:
    """Wait for S3 and ensure the configured bucket exists."""
    for attempt in range(attempts):
        try:
            storage.head_bucket()
            return
        except Exception:
            try:
                storage.client.create_bucket(Bucket=storage.bucket)
                return
            except Exception as error:
                if attempt == attempts - 1:
                    raise RuntimeError("S3 did not become ready") from error
                time.sleep(delay)


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
        ensure_bucket(storage)
    except RuntimeError as e:
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
                raise

    asyncio.run(_seed())


if __name__ == "__main__":
    run()
