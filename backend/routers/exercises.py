from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session as get_db_session
from telegram_auth import current_user_id
from models import BODYWEIGHT_WEIGHT, Exercise, PerformedSet, PlannedExercise, WorkoutSession
from schemas import ExerciseFacets, ExerciseOut

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    muscle_group: Optional[str] = Query(None, description="Filter by muscle group"),
    body_part: Optional[str] = Query(None, description="Filter by body part"),
    equipment: Optional[str] = Query(None, description="Filter by equipment type"),
    search: Optional[str] = Query(None, description="Search by name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_session),
):
    """List exercise catalog, optionally filtered by muscle group, equipment or name."""
    statement = select(Exercise)

    if muscle_group:
        statement = statement.where(Exercise.muscle_group == muscle_group)
    if body_part:
        statement = statement.where(Exercise.body_part == body_part)
    if equipment:
        statement = statement.where(Exercise.equipment == equipment)
    if search:
        statement = statement.where(Exercise.name.ilike(f"%{search}%"))

    statement = statement.order_by(Exercise.name).offset(offset).limit(limit)
    result = await db.execute(statement)
    return result.scalars().all()


@router.get("/facets", response_model=ExerciseFacets)
async def exercise_facets(db: AsyncSession = Depends(get_db_session)):
    """Return valid catalog filters so clients and agents do not guess values."""
    async def distinct_values(column):
        rows = (await db.execute(select(column).distinct().order_by(column))).all()
        return [value for (value,) in rows if value]

    return ExerciseFacets(
        muscle_groups=await distinct_values(Exercise.muscle_group),
        body_parts=await distinct_values(Exercise.body_part),
        equipment=await distinct_values(Exercise.equipment),
    )


@router.get("/records")
async def personal_records(
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Personal records with a backend-owned weight mode."""
    statement = (
        select(
            Exercise.id, Exercise.name, Exercise.muscle_group, Exercise.equipment,
            Exercise.image_url, PerformedSet.weight, PerformedSet.reps,
            WorkoutSession.session_date, WorkoutSession.id,
        )
        .join(PlannedExercise, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .join(WorkoutSession, PlannedExercise.session_id == WorkoutSession.id)
        .join(Exercise, PlannedExercise.exercise_id == Exercise.id)
    )
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = statement.order_by(
        Exercise.id, PerformedSet.weight.desc(), PerformedSet.reps.desc(),
        WorkoutSession.session_date.desc(), PerformedSet.id.desc(),
    )
    rows = (await db.execute(statement)).all()
    records: dict[int, dict] = {}
    for exercise_id, name, muscle_group, equipment, image_url, weight, reps, session_date, session_id in rows:
        record = records.get(exercise_id)
        if record is None:
            records[exercise_id] = {
                "exercise_id": exercise_id, "name": name, "muscle_group": muscle_group,
                "equipment": equipment, "image_url": image_url,
                # The first row is one real best set, never a synthetic weight/reps pair.
                "max_weight": BODYWEIGHT_WEIGHT if equipment == "body weight" else float(weight or 0),
                "max_reps": int(reps or 0),
                "weight_mode": "bodyweight" if equipment == "body weight" else "weighted" if weight and weight > 0 else "unloaded",
                "last_date": session_date, "sessions": {session_id},
            }
        else:
            record["sessions"].add(session_id)
            record["last_date"] = max(record["last_date"], session_date)
    return [
        {**record, "last_date": record["last_date"].isoformat(), "sessions": len(record["sessions"])}
        for record in sorted(records.values(), key=lambda item: item["last_date"], reverse=True)
    ]


@router.get("/{exercise_id}/progress")
async def exercise_progress(
    exercise_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user_id: Optional[int] = Depends(current_user_id),
):
    """Per-session progression with server-computed weight semantics."""
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    statement = (
        select(
            WorkoutSession.id,
            WorkoutSession.session_date,
            func.max(PerformedSet.weight),
            func.max(PerformedSet.reps),
            func.sum(case((PerformedSet.weight > 0, PerformedSet.weight * PerformedSet.reps), else_=0)),
            func.count(PerformedSet.id),
        )
        .join(PlannedExercise, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .join(WorkoutSession, PlannedExercise.session_id == WorkoutSession.id)
        .where(PlannedExercise.exercise_id == exercise_id)
    )
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = (
        statement.group_by(WorkoutSession.id, WorkoutSession.session_date)
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(statement)).all()
    return [
        {
            "session_id": session_id,
            "date": session_date.isoformat(),
            "top_weight": float(top_weight or 0) if not exercise.is_bodyweight else BODYWEIGHT_WEIGHT,
            "top_reps": int(top_reps or 0),
            "volume": float(volume or 0) if not exercise.is_bodyweight else 0,
            "weight_mode": "bodyweight" if exercise.is_bodyweight else "weighted" if top_weight and top_weight > 0 else "unloaded",
            "sets": set_count,
        }
        for session_id, session_date, top_weight, top_reps, volume, set_count in reversed(rows)
    ]


@router.get("/{exercise_id}", response_model=ExerciseOut)
async def get_exercise(
    exercise_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    """Get exercise detail by ID."""
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
