from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from telegram_auth import get_telegram_user_id
from models import AthleteProfile
from schemas import AthleteProfileIn, AthleteProfileOut

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _get_or_create_profile(db: AsyncSession, uid: int | None = None) -> AthleteProfile:
    """Get the athlete profile for a given Telegram user, or create one."""
    if uid:
        result = await db.execute(
            select(AthleteProfile).where(AthleteProfile.telegram_user_id == uid).limit(1)
        )
        profile = result.scalar_one_or_none()
        if profile:
            return profile
    else:
        result = await db.execute(select(AthleteProfile).order_by(AthleteProfile.id).limit(1))
        profile = result.scalar_one_or_none()
        if profile:
            return profile
    profile = AthleteProfile(name="Athlete", telegram_user_id=uid)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("", response_model=AthleteProfileOut)
async def get_profile(
    db: AsyncSession = Depends(get_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Return the athlete profile for the authenticated Telegram user."""
    uid = get_telegram_user_id(init_data, coach_key)
    return await _get_or_create_profile(db, uid)


@router.put("", response_model=AthleteProfileOut)
async def update_profile(
    body: AthleteProfileIn,
    db: AsyncSession = Depends(get_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Replace/update the athlete profile from coach onboarding."""
    uid = get_telegram_user_id(init_data, coach_key)
    profile = await _get_or_create_profile(db, uid)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(profile, key, value)
    if uid is not None:
        profile.telegram_user_id = uid
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.patch("", response_model=AthleteProfileOut)
async def patch_profile(
    body: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Patch selected profile fields. Intended for conversational incremental updates."""
    uid = get_telegram_user_id(init_data, coach_key)
    allowed = set(AthleteProfileIn.model_fields.keys())
    profile = await _get_or_create_profile(db, uid)
    for key, value in body.items():
        if key in allowed:
            setattr(profile, key, value)
    if uid is not None:
        profile.telegram_user_id = uid
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return profile