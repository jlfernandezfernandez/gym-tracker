"""One-off release work. Run this before starting or scaling API replicas."""
import asyncio
import sys

from database import async_session, init_db
from main import _ensure_s3_bucket
from seed.exercises import download_missing_media, seed_exercises


async def run() -> None:
    await init_db()
    await asyncio.to_thread(_ensure_s3_bucket)
    async with async_session() as session:
        await seed_exercises(session)
    if "--media" in sys.argv:
        await download_missing_media()


if __name__ == "__main__":
    asyncio.run(run())
