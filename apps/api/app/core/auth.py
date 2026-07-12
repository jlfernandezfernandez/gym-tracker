import hashlib
import hmac
import json
import time
import urllib.parse

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from app.core.config import get_settings

telegram_header = APIKeyHeader(name="X-Telegram-Init-Data", auto_error=False)
coach_header = APIKeyHeader(name="X-Coach-Key", auto_error=False)
acting_user_header = APIKeyHeader(name="X-Telegram-User-Id", auto_error=False)


def coach_acting_user_id(acting_user: str | None) -> int:
    """The coach key grants access only on behalf of one Telegram user.

    Honored exclusively after the coach key is validated; a Telegram client
    cannot impersonate because its signed init data wins.
    """
    if not acting_user or not acting_user.isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Coach requests must include X-Telegram-User-Id",
        )
    return int(acting_user)


def validate_auth_date(auth_date: str | None, now: float, ttl: int) -> int:
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
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user data"
            ) from exc
    return {}


async def current_user_id(
    telegram_data: str | None = Depends(telegram_header),
    coach_key: str | None = Depends(coach_header),
    acting_user: str | None = Depends(acting_user_header),
) -> int | None:
    settings = get_settings()
    if settings.auth_disabled:
        return None
    if coach_key and coach_key == settings.coach_api_key:
        return coach_acting_user_id(acting_user)
    if not telegram_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication"
        )
    try:
        user_data = validate_init_data(
            telegram_data, settings.telegram_bot_token, settings.auth_ttl
        )
        user_id = user_data.get("id")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user ID")
        return int(user_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user ID"
        ) from exc
