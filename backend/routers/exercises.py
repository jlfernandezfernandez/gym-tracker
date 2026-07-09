from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from telegram_auth import current_user_id
from models import Exercise, PerformedSet, PlannedExercise, WorkoutSession
from schemas import ExerciseOut

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    muscle_group: Optional[str] = Query(None, description="Filter by muscle group"),
    equipment: Optional[str] = Query(None, description="Filter by equipment type"),
    search: Optional[str] = Query(None, description="Search by name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """List exercise catalog, optionally filtered by muscle group, equipment or name."""
    stmt = select(Exercise)

    if muscle_group:
        stmt = stmt.where(Exercise.muscle_group == muscle_group)
    if equipment:
        stmt = stmt.where(Exercise.equipment == equipment)
    if search:
        stmt = stmt.where(Exercise.name.ilike(f"%{search}%"))

    stmt = stmt.order_by(Exercise.name).offset(offset).limit(limit)
    result = await session.execute(stmt)
    exercises = result.scalars().all()
    return exercises


@router.get("/muscle-groups", response_model=list[str])
async def list_muscle_groups(
    session: AsyncSession = Depends(get_session),
):
    """List distinct muscle groups available in the catalog."""
    stmt = select(Exercise.muscle_group).distinct().order_by(Exercise.muscle_group)
    result = await session.execute(stmt)
    return [row[0] for row in result.all() if row[0]]


@router.get("/equipment", response_model=list[str])
async def list_equipment(
    session: AsyncSession = Depends(get_session),
):
    """List distinct equipment types."""
    stmt = select(Exercise.equipment).distinct().order_by(Exercise.equipment)
    result = await session.execute(stmt)
    return [row[0] for row in result.all() if row[0]]


@router.get("/records")
async def personal_records(
    session: AsyncSession = Depends(get_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Personal records: every exercise the athlete has performed, with max weight and last date."""
    stmt = (
        select(
            Exercise.id,
            Exercise.name,
            Exercise.muscle_group,
            Exercise.equipment,
            Exercise.image_url,
            func.max(PerformedSet.weight),
            func.max(WorkoutSession.session_date),
            func.count(func.distinct(WorkoutSession.id)),
        )
        .join(PlannedExercise, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .join(WorkoutSession, PlannedExercise.session_id == WorkoutSession.id)
        .join(Exercise, PlannedExercise.exercise_id == Exercise.id)
    )
    if uid:
        stmt = stmt.where(WorkoutSession.telegram_user_id == uid)
    stmt = stmt.group_by(Exercise.id).order_by(func.max(WorkoutSession.session_date).desc())
    rows = (await session.execute(stmt)).all()
    return [
        {
            "exercise_id": r[0],
            "name": r[1],
            "muscle_group": r[2],
            "equipment": r[3],
            "image_url": r[4],
            "max_weight": float(r[5] or 0),
            "last_date": r[6].isoformat(),
            "sessions": r[7],
        }
        for r in rows
    ]


@router.get("/{exercise_id}/progress")
async def exercise_progress(
    exercise_id: int,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Per-session progression for one exercise: top weight, volume and sets."""
    stmt = (
        select(
            WorkoutSession.session_date,
            func.max(PerformedSet.weight),
            func.sum(PerformedSet.weight * PerformedSet.reps),
            func.count(PerformedSet.id),
        )
        .join(PlannedExercise, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .join(WorkoutSession, PlannedExercise.session_id == WorkoutSession.id)
        .where(PlannedExercise.exercise_id == exercise_id)
    )
    if uid:
        stmt = stmt.where(WorkoutSession.telegram_user_id == uid)
    stmt = (
        stmt.group_by(WorkoutSession.id, WorkoutSession.session_date)
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {"date": r[0].isoformat(), "top_weight": float(r[1] or 0), "volume": float(r[2] or 0), "sets": r[3]}
        for r in reversed(rows)
    ]


@router.get("/{exercise_id}", response_model=ExerciseOut)
async def get_exercise(
    exercise_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Get exercise detail by ID."""
    exercise = await session.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise
