from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/gym_tracker",
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        # Lightweight auto-migration: add columns that may be missing on
        # existing databases (create_all does not ALTER existing tables).
        from sqlalchemy import text
        migrations = [
            "ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT",
            "ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT",
        ]
        for sql in migrations:
            await conn.execute(text(sql))
