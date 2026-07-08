"""Run seed exercises in the gym-tracker container."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from database import async_session, init_db
from seed.exercises import seed_exercises


async def run():
    await init_db()
    async with async_session() as session:
        n = await seed_exercises(session)
        print(f"Inserted: {n}")


asyncio.run(run())
