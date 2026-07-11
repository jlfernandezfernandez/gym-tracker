from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings


@lru_cache
def _get_async_session() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(
        get_settings().database_url, echo=False, pool_size=5, max_overflow=10
    )
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession]:
    async with _get_async_session()() as session:
        yield session
