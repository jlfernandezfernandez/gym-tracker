"""Telegram WebApp initData validation.

Telegram sends `window.Telegram.WebApp.initData` as a query string when a user
opens a Mini App. The string is signed with the bot token using HMAC-SHA256.

This module validates the signature and extracts the user identity, so the
backend can scope sessions and profiles per Telegram user without passwords.

The MCP server (coach agent) can bypass init_data by sending an X-Coach-Key
header matching COACH_API_KEY env var. This gives full access without a
specific Telegram user identity — the coach manages all users.

Usage in routers:

    from telegram_auth import get_telegram_user_id
    uid = get_telegram_user_id(init_data)  # raises 401 if invalid
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import urllib.parse
from functools import lru_cache
from typing import Any, Optional

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
COACH_API_KEY = os.getenv("COACH_API_KEY", "")
_AUTH_DISABLED = not BOT_TOKEN
# Max age of init_data in seconds (24 hours). Prevents replay attacks.
AUTH_TTL = int(os.getenv("TELEGRAM_AUTH_TTL", "86400"))

if _AUTH_DISABLED:
    logger.warning(
        "TELEGRAM_BOT_TOKEN is not set — auth is DISABLED. "
        "Anyone can access all sessions. Set TELEGRAM_BOT_TOKEN in production."
    )


@lru_cache(maxsize=1)
def _secret_key() -> bytes:
    """Derive the HMAC secret from the bot token (Telegram spec)."""
    return hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()


def validate_init_data(init_data: str) -> dict[str, Any]:
    """Validate Telegram Mini App init_data and return parsed user dict.

    Returns:
        {"user": {...}, "auth_date": ..., "hash": ...} on success.

    Raises:
        HTTPException(401) if the signature is invalid or expired.
    """
    if _AUTH_DISABLED:
        return {"user": {"id": 0, "first_name": "dev", "username": "dev"}}

    parsed = urllib.parse.parse_qs(init_data)
    received_hash = parsed.pop("hash", [None])[0]
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash in init_data")

    # Check auth_date freshness to prevent replay attacks
    auth_date_raw = parsed.get("auth_date", [None])[0]
    if auth_date_raw:
        try:
            auth_date = int(auth_date_raw)
            if time.time() - auth_date > AUTH_TTL:
                raise HTTPException(status_code=401, detail="init_data expired")
        except ValueError:
            pass  # Malformed auth_date — continue anyway, Telegram always sends it

    # Build data-check string: sorted key=value pairs joined by newline.
    data_parts = []
    for key in sorted(parsed.keys()):
        for val in parsed[key]:
            data_parts.append(f"{key}={val}")
    data_check_string = "\n".join(data_parts)

    computed = hmac.new(_secret_key(), data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        raise HTTPException(status_code=401, detail="Invalid init_data signature")

    # Parse user JSON
    user_raw = parsed.get("user", [None])[0]
    if user_raw:
        parsed["user"] = [json.loads(user_raw)]

    # Flatten: return the dict with user as a nested dict
    result: dict[str, Any] = {}
    for k, v in parsed.items():
        result[k] = v[0] if len(v) == 1 else v
    return result


def get_telegram_user(init_data: str | None) -> dict[str, Any]:
    """Validate init_data and return just the user dict.

    If init_data is None or empty, returns a dev user when auth is disabled,
    or raises 401 when auth is enabled.
    """
    if not init_data:
        if _AUTH_DISABLED:
            return {"id": 0, "first_name": "dev", "username": "dev"}
        raise HTTPException(status_code=401, detail="No init_data provided")

    validated = validate_init_data(init_data)
    return validated.get("user", {})


def get_telegram_user_id(init_data: str | None) -> Optional[int]:
    """Convenience: return just the telegram user id (int) or None."""
    user = get_telegram_user(init_data)
    uid = user.get("id")
    return int(uid) if uid is not None else None


async def current_user_id(
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
    coach_user_id: Optional[int] = Header(None, alias="X-Telegram-User-Id"),
) -> Optional[int]:
    """FastAPI dependency resolving the acting Telegram user.

    - Mini App: validates X-Telegram-Init-Data (HMAC) and returns its user id.
    - Coach MCP: X-Coach-Key matching COACH_API_KEY plus X-Telegram-User-Id
      scopes the request to that user. Without X-Telegram-User-Id the coach
      gets unscoped access (single-user instances / admin).
    """
    if coach_key and COACH_API_KEY and hmac.compare_digest(coach_key, COACH_API_KEY):
        return coach_user_id
    return get_telegram_user_id(init_data)