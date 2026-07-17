from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.auth import current_user_id
from app.core.database import get_session
from app.features.disliked.schemas import DislikedExerciseIn, DislikedExerciseOut
from app.features.profile.routes import _get_or_create_profile
from app.models import AthleteDislikedExercise, Exercise

router = APIRouter(prefix="/disliked-exercises", tags=["disliked"])


async def disliked_exercise_ids(
    db: AsyncSession, athlete_id: int, exercise_ids: list[int]
) -> set[int]:
    """Subset of exercise_ids the athlete has marked as disliked."""
    result = await db.execute(
        select(col(AthleteDislikedExercise.exercise_id)).where(
            AthleteDislikedExercise.athlete_id == athlete_id,
            col(AthleteDislikedExercise.exercise_id).in_(exercise_ids),
        )
    )
    return set(result.scalars().all())


@router.get("", response_model=list[DislikedExerciseOut])
async def list_disliked(
    db: AsyncSession = Depends(get_session),
    user_id: int | None = Depends(current_user_id),
):
    """List exercises the athlete has marked as disliked."""
    profile = await _get_or_create_profile(db, user_id)
    statement = (
        select(
            col(AthleteDislikedExercise.id),
            col(AthleteDislikedExercise.athlete_id),
            col(AthleteDislikedExercise.exercise_id),
            col(AthleteDislikedExercise.created_at),
            col(Exercise.name),
            col(Exercise.name_en),
            col(Exercise.muscle_group),
            col(Exercise.equipment),
            col(Exercise.image_url),
        )
        .join(Exercise, AthleteDislikedExercise.exercise_id == Exercise.id)
        .where(AthleteDislikedExercise.athlete_id == profile.id)
        .order_by(AthleteDislikedExercise.created_at.desc())
    )
    rows = (await db.execute(statement)).all()
    return [DislikedExerciseOut(**row._mapping) for row in rows]


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
        **disliked.model_dump(),
        **exercise.model_dump(
            include={"name", "name_en", "muscle_group", "equipment", "image_url"}
        ),
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
