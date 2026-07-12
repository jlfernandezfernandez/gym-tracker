from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app import APP_VERSION
from app.core.config import get_settings
from app.core.database import _get_async_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


async def check_dependencies() -> None:
    """Verify the dependencies required to serve real application traffic."""
    async with _get_async_session()() as session:
        await session.execute(text("SELECT 1"))
    if not (get_settings().exercise_dataset_dir / ".installed").is_file():
        raise RuntimeError("exercise dataset is not installed")


@router.get("/ready")
async def ready():
    try:
        await check_dependencies()
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="not ready",
        ) from error
    return {"status": "ready", "version": APP_VERSION}
