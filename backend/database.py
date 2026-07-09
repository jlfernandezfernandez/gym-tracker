from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from alembic.config import Config
from alembic import command
from pathlib import Path
import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/gym_tracker",
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        yield session


def _apply_migrations() -> None:
    cfg = Config(str(Path(__file__).parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    command.upgrade(cfg, "head")


async def init_db() -> None:
    await asyncio.to_thread(_apply_migrations)
