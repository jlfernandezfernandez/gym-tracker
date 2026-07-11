from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.config import get_settings

telegram_header = APIKeyHeader(name="X-Telegram-Init-Data", auto_error=False)
coach_header = APIKeyHeader(name="X-Coach-Key", auto_error=False)


async def current_user_id(
    telegram_data: Optional[str] = Depends(telegram_header),
    coach_key: Optional[str] = Depends(coach_header),
) -> Optional[int]:
    settings = get_settings()
    if settings.auth_disabled:
        return None
    if coach_key and coach_key == settings.coach_api_key:
        return None
    if not telegram_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication")
    return 1
