import hashlib
import hmac
import json
import time
import urllib.parse
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.config import get_settings

telegram_header = APIKeyHeader(name="X-Telegram-Init-Data", auto_error=False)
coach_header = APIKeyHeader(name="X-Coach-Key", auto_error=False)


def validate_auth_date(auth_date: Optional[str], now: float, ttl: int) -> int:
    if not auth_date or not auth_date.isdigit():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth_date")
    auth_date_int = int(auth_date)
    if now - auth_date_int > ttl:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth date expired")
    if auth_date_int - now > 30:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth date in future")
    return auth_date_int


def validate_init_data(init_data: str, bot_token: str, ttl: int = 86400) -> dict:
    parsed = urllib.parse.parse_qs(init_data)
    auth_date = parsed.get("auth_date", [None])[0]
    now = time.time()
    validate_auth_date(auth_date, now, ttl)
    hash_value = parsed.get("hash", [None])[0]
    if not hash_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing hash")
    data_check_string = "\n".join(
        f"{key}={value[0]}" for key, value in sorted(parsed.items()) if key != "hash"
    )
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, hash_value):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")
    user_data = parsed.get("user", [None])[0]
    if user_data:
        try:
            return json.loads(user_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user data")
    return {}


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
    try:
        user_data = validate_init_data(telegram_data, settings.telegram_bot_token, settings.auth_ttl)
        user_id = user_data.get("id")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user ID")
        return int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user ID")
