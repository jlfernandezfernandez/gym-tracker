import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.auth import current_user_id
from app.core.database import get_session as get_db_session
from app.features.coach.onerm import calculate_1rm
from app.features.exercises.schemas import ExerciseFacets
from app.features.profile.routes import _get_or_create_profile
from app.features.sessions.schemas import ExerciseOut
from app.models import (
    UNLOADED_EQUIPMENT,
    AthleteDislikedExercise,
    Exercise,
    PerformedSet,
    PlannedExercise,
    WorkoutSession,
    weight_mode,
)

router = APIRouter(prefix="/exercises", tags=["exercises"])


_SEARCH_SYNONYMS = {
    "leg curl": "flexion piernas",
    "curl femoral": "flexion piernas",
    "hamstring curl": "flexion piernas",
    "aductor": "aduccion",
    "adductors": "aduccion",
    "abductor": "abduccion",
    "abductors": "abduccion",
    "stepper": "escaladora",
    "stair climber": "escaladora",
}


def _normalize_search(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    for source, replacement in _SEARCH_SYNONYMS.items():
        value = value.replace(source, replacement)
    return " ".join(value.split())


def _normalized_column(column):
    expression = func.lower(column)
    for source, replacement in (
        ("á", "a"),
        ("é", "e"),
        ("í", "i"),
        ("ó", "o"),
        ("ú", "u"),
        ("ü", "u"),
    ):
        expression = func.replace(expression, source, replacement)
    return expression


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    muscle_group: str | None = Query(None, description="Filter by muscle group"),
    body_part: str | None = Query(None, description="Filter by body part"),
    equipment: str | None = Query(None, description="Filter by equipment type"),
    activity_type: str | None = Query(None, pattern="^(strength|cardio)$"),
    search: str | None = Query(None, description="Search by name"),
    exclude_disliked: bool = Query(False, description="Exclude athlete's disliked exercises"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """List exercise catalog, optionally filtered by muscle group, equipment or name."""
    statement = select(Exercise)

    if muscle_group:
        statement = statement.where(Exercise.muscle_group == muscle_group)
    if body_part:
        statement = statement.where(Exercise.body_part == body_part)
    if equipment:
        statement = statement.where(Exercise.equipment == equipment)
    if activity_type:
        statement = statement.where(Exercise.activity_type == activity_type)
    if search:
        normalized_search = _normalize_search(search)
        for term in normalized_search.split():
            pattern = f"%{term}%"
            statement = statement.where(
                _normalized_column(Exercise.name).like(pattern)
                | _normalized_column(Exercise.name_en).like(pattern)
            )

    if exclude_disliked:
        profile = await _get_or_create_profile(db, user_id)
        disliked_subq = select(col(AthleteDislikedExercise.exercise_id)).where(
            AthleteDislikedExercise.athlete_id == profile.id
        )
        statement = statement.where(Exercise.id.notin_(disliked_subq))

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
        activity_types=await distinct_values(Exercise.activity_type),
    )


@router.get("/records")
async def personal_records(
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Personal records with a backend-owned weight mode."""
    statement = (
        select(  # pyright: ignore[reportCallIssue]
            Exercise.id,
            Exercise.name,
            Exercise.muscle_group,
            Exercise.equipment,
            Exercise.image_url,
            Exercise.activity_type,
            PerformedSet.weight,
            PerformedSet.reps,
            PerformedSet.duration_minutes,
            PerformedSet.is_warmup,
            WorkoutSession.session_date,
            WorkoutSession.id,
        )
        .join(PlannedExercise, PerformedSet.planned_exercise_id == PlannedExercise.id)
        .join(WorkoutSession, PlannedExercise.session_id == WorkoutSession.id)
        .join(Exercise, PlannedExercise.exercise_id == Exercise.id)
    )
    if user_id:
        statement = statement.where(WorkoutSession.telegram_user_id == user_id)
    statement = statement.order_by(
        Exercise.id,
        PerformedSet.duration_minutes.desc().nulls_last(),  # pyright: ignore[reportOptionalMemberAccess]
        PerformedSet.weight.desc().nulls_last(),  # pyright: ignore[reportOptionalMemberAccess]
        PerformedSet.reps.desc(),  # pyright: ignore[reportOptionalMemberAccess]
        WorkoutSession.session_date.desc(),
        PerformedSet.id.desc(),
    )
    rows = (await db.execute(statement)).all()
    records: dict[int, dict] = {}
    for (
        exercise_id,
        name,
        muscle_group,
        equipment,
        image_url,
        activity_type,
        weight,
        reps,
        duration_minutes,
        is_warmup,
        session_date,
        session_id,
    ) in rows:
        record = records.get(exercise_id)
        e1rm = None if is_warmup or activity_type == "cardio" else calculate_1rm(weight, reps)
        if record is None:
            records[exercise_id] = {
                "exercise_id": exercise_id,
                "name": name,
                "muscle_group": muscle_group,
                "equipment": equipment,
                "image_url": image_url,
                "activity_type": activity_type,
                # The first row is one real best set, never a synthetic weight/reps pair.
                "max_weight": float(weight) if weight is not None else None,
                "max_reps": None if activity_type == "cardio" else int(reps or 0),
                "max_duration_minutes": (
                    int(duration_minutes or 0) if activity_type == "cardio" else None
                ),
                "estimated_1rm": e1rm,
                "weight_mode": (
                    None
                    if activity_type == "cardio"
                    else weight_mode(equipment in UNLOADED_EQUIPMENT, weight)
                ),
                "last_date": session_date,
                "sessions": {session_id},
            }
        else:
            record["sessions"].add(session_id)
            record["last_date"] = max(record["last_date"], session_date)
            if e1rm and (record.get("estimated_1rm") is None or e1rm > record["estimated_1rm"]):
                record["estimated_1rm"] = e1rm

    return [
        {
            **record,
            "last_date": record["last_date"].isoformat(),
            "sessions": len(record["sessions"]),
        }
        for record in sorted(records.values(), key=lambda item: item["last_date"], reverse=True)
    ]


@router.get("/{exercise_id}/progress")
async def exercise_progress(
    exercise_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user_id: int | None = Depends(current_user_id),
):
    """Per-session progression with server-computed weight semantics."""
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    statement = (
        select(  # pyright: ignore[reportCallIssue]
            WorkoutSession.id,
            WorkoutSession.session_date,
            func.max(PerformedSet.weight),
            func.max(PerformedSet.reps),
            func.max(PerformedSet.duration_minutes),
            func.sum(
                case((PerformedSet.weight > 0, PerformedSet.weight * PerformedSet.reps), else_=0)  # pyright: ignore[reportOptionalOperand, reportOperatorIssue]
            ),
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
    progress_list = []
    for (
        session_id,
        session_date,
        top_weight,
        top_reps,
        top_duration_minutes,
        volume,
        set_count,
    ) in reversed(rows):
        item = {
            "session_id": session_id,
            "date": session_date.isoformat(),
            "top_weight": float(top_weight) if top_weight is not None else None,
            "top_reps": None if exercise.is_cardio else int(top_reps or 0),
            "top_duration_minutes": (
                int(top_duration_minutes or 0) if exercise.is_cardio else None
            ),
            "volume": float(volume or 0),
            "activity_type": exercise.activity_type,
            "weight_mode": (
                None if exercise.is_cardio else weight_mode(exercise.is_unloaded, top_weight)
            ),
            "sets": set_count,
        }
        if not exercise.is_cardio and top_weight and top_reps:
            item["estimated_1rm"] = calculate_1rm(float(top_weight), int(top_reps))
        progress_list.append(item)
    return progress_list


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
