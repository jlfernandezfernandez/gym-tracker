from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_user_id
from app.core.database import get_session
from app.features.disliked.schemas import DislikedExerciseIn, DislikedExerciseOut
from app.features.profile.routes import _get_or_create_profile
from app.models import AthleteDislikedExercise, Exercise

router = APIRouter(prefix="/disliked-exercises", tags=["disliked"])


@router.get("", response_model=list[DislikedExerciseOut])
async def list_disliked(
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """List exercises the athlete has marked as disliked."""
    profile = await _get_or_create_profile(db, user_id)
    statement = (
        select(
            AthleteDislikedExercise.id,
            AthleteDislikedExercise.athlete_id,
            AthleteDislikedExercise.exercise_id,
            AthleteDislikedExercise.created_at,
            Exercise.name,
            Exercise.name_en,
            Exercise.muscle_group,
            Exercise.equipment,
            Exercise.image_url,
        )
        .join(Exercise, AthleteDislikedExercise.exercise_id == Exercise.id)
        .where(AthleteDislikedExercise.athlete_id == profile.id)
        .order_by(AthleteDislikedExercise.created_at.desc())
    )
    rows = (await db.execute(statement)).all()
    return [
        DislikedExerciseOut(
            id=row.id,
            athlete_id=row.athlete_id,
            exercise_id=row.exercise_id,
            created_at=row.created_at,
            name=row.name,
            name_en=row.name_en,
            muscle_group=row.muscle_group,
            equipment=row.equipment,
            image_url=row.image_url,
        )
        for row in rows
    ]


@router.post("", response_model=DislikedExerciseOut, status_code=201)
async def add_disliked(
    body: DislikedExerciseIn,
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Mark an exercise as disliked."""
    profile = await _get_or_create_profile(db, user_id)
    exercise = await db.get(Exercise, body.exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    existing = await db.execute(
        select(AthleteDislikedExercise).where(
            AthleteDislikedExercise.athlete_id == profile.id,
            AthleteDislikedExercise.exercise_id == body.exercise_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already disliked")
    disliked = AthleteDislikedExercise(
        athlete_id=profile.id,
        exercise_id=body.exercise_id,
    )
    db.add(disliked)
    await db.commit()
    await db.refresh(disliked)
    return DislikedExerciseOut(
        id=disliked.id,
        athlete_id=disliked.athlete_id,
        exercise_id=disliked.exercise_id,
        created_at=disliked.created_at,
        name=exercise.name,
        name_en=exercise.name_en,
        muscle_group=exercise.muscle_group,
        equipment=exercise.equipment,
        image_url=exercise.image_url,
    )


@router.delete("/{exercise_id}")
async def remove_disliked(
    exercise_id: int,
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """Remove an exercise from the disliked list."""
    profile = await _get_or_create_profile(db, user_id)
    result = await db.execute(
        select(AthleteDislikedExercise).where(
            AthleteDislikedExercise.athlete_id == profile.id,
            AthleteDislikedExercise.exercise_id == exercise_id,
        )
    )
    disliked = result.scalar_one_or_none()
    if not disliked:
        raise HTTPException(status_code=404, detail="Not in disliked list")
    await db.delete(disliked)
    await db.commit()
    return {"ok": True}
