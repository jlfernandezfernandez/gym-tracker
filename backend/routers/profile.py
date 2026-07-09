from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from telegram_auth import current_user_id
from models import AthleteProfile, AthleteMeasurement
from schemas import AthleteProfileIn, AthleteProfileOut, AthleteMeasurementIn, AthleteMeasurementOut

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _get_or_create_profile(db: AsyncSession, user_id: int | None = None) -> AthleteProfile:
    """Get the athlete profile for a given Telegram user, or create one."""
    if user_id:
        result = await db.execute(
            select(AthleteProfile).where(AthleteProfile.telegram_user_id == user_id).limit(1)
        )
        profile = result.scalar_one_or_none()
        if profile:
            return profile
    else:
        result = await db.execute(select(AthleteProfile).order_by(AthleteProfile.id).limit(1))
        profile = result.scalar_one_or_none()
        if profile:
            return profile
    profile = AthleteProfile(name="Athlete", telegram_user_id=user_id)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("", response_model=AthleteProfileOut)
async def get_profile(
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Return the athlete profile for the authenticated Telegram user."""
    return await _get_or_create_profile(db, user_id)


@router.patch("", response_model=AthleteProfileOut)
async def patch_profile(
    body: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Patch selected profile fields. Intended for conversational incremental updates."""
    allowed = set(AthleteProfileIn.model_fields.keys())
    profile = await _get_or_create_profile(db, user_id)
    for key, value in body.items():
        if key in allowed:
            setattr(profile, key, value)
    if user_id is not None:
        profile.telegram_user_id = user_id
    profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/measurements", response_model=list[AthleteMeasurementOut])
async def list_measurements(
    limit: int = 20,
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Return historical body measurements from any source: manual, scale, scan, clinic, etc."""
    statement = select(AthleteMeasurement)
    if user_id:
        statement = statement.where(AthleteMeasurement.telegram_user_id == user_id)
    else:
        statement = statement.where(AthleteMeasurement.telegram_user_id == None)  # noqa: E711
    statement = statement.order_by(AthleteMeasurement.measured_at.desc()).limit(max(1, min(limit, 100)))
    result = await db.execute(statement)
    return result.scalars().all()


@router.post("/measurements", response_model=AthleteMeasurementOut)
async def add_measurement(
    body: AthleteMeasurementIn,
    db: AsyncSession = Depends(get_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Add one historical body measurement. Also updates current profile weight when provided."""
    profile = await _get_or_create_profile(db, user_id)
    measurement = AthleteMeasurement(
        telegram_user_id=user_id,
        measured_at=(body.measured_at or datetime.now(timezone.utc)).replace(tzinfo=None),
        source=body.source,
        weight_kg=body.weight_kg,
        muscle_kg=body.muscle_kg,
        fat_kg=body.fat_kg,
        body_fat_pct=body.body_fat_pct,
        visceral_fat=body.visceral_fat,
        score=body.score,
        notes=body.notes,
    )
    db.add(measurement)
    if body.weight_kg is not None:
        profile.weight_kg = body.weight_kg
        profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(measurement)
    return measurement
