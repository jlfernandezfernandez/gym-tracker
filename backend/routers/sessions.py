from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from database import get_session as get_db_session
from telegram_auth import current_user_id
from models import Exercise, WorkoutSession, PlannedExercise, PerformedSet
from schemas import (
    SessionCreate,
    SessionOut,
    SessionSummary,
    PerformedSetCreate,
    PlannedExerciseUpdate,
    SessionFinish,
)

PLANNED_EXERCISE_STATUSES = {"pending", "in_progress", "completed", "skipped", "changed"}

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


async def _load_session(session_id: int, db: AsyncSession) -> WorkoutSession:
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            ),
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.exercise
            ),
        )
    )
    result = await db.execute(stmt)
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


def _check_owner(session: WorkoutSession, uid: int | None):
    """Verify the session belongs to the authenticated user. Skip in dev mode."""
    if uid and session.telegram_user_id and session.telegram_user_id != uid:
        raise HTTPException(status_code=403, detail="This session belongs to another user")


def _current_state(s: WorkoutSession) -> dict:
    """Derive active exercise/set from persisted exercise statuses and logged sets."""
    planned = sorted(s.planned_exercises or [], key=lambda pe: pe.order)
    current = None
    for pe in planned:
        if pe.status in {"pending", "in_progress", "changed"}:
            current = pe
            break
    if current is None and planned:
        current = planned[-1]

    completed_exercises = sum(1 for pe in planned if pe.status == "completed")
    total_sets = sum(pe.target_sets for pe in planned)
    completed_sets = sum(len(pe.performed_sets or []) for pe in planned)

    if current is None:
        return {
            "session_id": s.id,
            "session_status": s.status,
            "current_planned_exercise_id": None,
            "current_set_number": None,
            "exercise_order": None,
            "exercise_count": 0,
            "completed_exercises": completed_exercises,
            "completed_sets": completed_sets,
            "total_sets": total_sets,
            "is_complete": True,
        }

    current_sets = len(current.performed_sets or [])
    next_set = min(current_sets + 1, current.target_sets)
    return {
        "session_id": s.id,
        "session_status": s.status,
        "current_planned_exercise_id": current.id,
        "current_exercise_id": current.exercise_id,
        "current_exercise_name": current.exercise.name if current.exercise else "",
        "current_set_number": next_set,
        "target_sets": current.target_sets,
        "target_reps": current.target_reps,
        "suggested_weight": current.suggested_weight,
        "exercise_order": current.order,
        "exercise_count": len(planned),
        "completed_exercises": completed_exercises,
        "completed_sets": completed_sets,
        "total_sets": total_sets,
        "is_complete": bool(planned) and completed_exercises == len(planned),
    }


@router.post("", response_model=SessionOut)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Create a full session with planned exercises."""
    db_session = WorkoutSession(
        title=body.title,
        goal=body.goal,
        status="planned",
        energy=body.energy,
        discomfort=body.discomfort,
        duration_estimated=body.duration_estimated,
        telegram_user_id=uid,
    )
    db.add(db_session)
    await db.flush()

    for ex in body.exercises:
        pe = PlannedExercise(
            session_id=db_session.id,
            exercise_id=ex.exercise_id,
            order=ex.order,
            target_sets=ex.target_sets,
            target_reps=ex.target_reps,
            suggested_weight=ex.suggested_weight,
            notes=ex.notes,
        )
        db.add(pe)

    await db.commit()
    return await _load_session(db_session.id, db)


@router.get("/today", response_model=SessionOut)
async def get_today_session(
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Get today's latest session if it exists."""
    stmt = select(WorkoutSession).where(WorkoutSession.session_date == date.today())
    if uid:
        stmt = stmt.where(WorkoutSession.telegram_user_id == uid)
    stmt = stmt.order_by(WorkoutSession.id.desc()).limit(1).options(
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
    )
    result = await db.execute(stmt)
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="No session found for today")
    return s


@router.get("/active")
async def get_active_session(
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Get latest non-completed session with derived current exercise state."""
    stmt = select(WorkoutSession).where(WorkoutSession.status != "completed")
    if uid:
        stmt = stmt.where(WorkoutSession.telegram_user_id == uid)
    stmt = stmt.order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc()).limit(1).options(
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
        selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
    )
    result = await db.execute(stmt)
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="No active session found")
    # Serialize explicitly: without a response_model FastAPI drops ORM relationships.
    return {"session": SessionOut.model_validate(s, from_attributes=True), "current": _current_state(s)}


@router.get("/{session_id}/current")
async def get_current_exercise(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Get derived current exercise/set for the agent and Mini App."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    return _current_state(s)


@router.post("/{session_id}/exercises/{planned_id}/complete", response_model=SessionOut)
async def complete_planned_exercise(
    session_id: int,
    planned_id: int,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Mark one planned exercise completed and keep session active."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    pe = await db.get(PlannedExercise, planned_id)
    if not pe or pe.session_id != session_id:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")
    pe.status = "completed"
    if s.status == "planned":
        s.status = "in_progress"
    await db.commit()
    return await _load_session(session_id, db)


@router.put("/{session_id}/exercises/{planned_id}", response_model=SessionOut)
async def update_planned_exercise(
    session_id: int,
    planned_id: int,
    body: PlannedExerciseUpdate,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Update a planned exercise: change status, swap the exercise, or set notes."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    pe = await db.get(PlannedExercise, planned_id)
    if not pe or pe.session_id != session_id:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

    if body.status is not None:
        if body.status not in PLANNED_EXERCISE_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status. Use one of: {sorted(PLANNED_EXERCISE_STATUSES)}")
        pe.status = body.status
    if body.new_exercise_id is not None:
        if not await db.get(Exercise, body.new_exercise_id):
            raise HTTPException(status_code=404, detail="Exercise not found in catalog")
        pe.exercise_id = body.new_exercise_id
        if body.status is None:
            pe.status = "changed"
    if body.notes is not None:
        pe.notes = body.notes

    if s.status == "planned" and pe.status in {"in_progress", "completed"}:
        s.status = "in_progress"
    await db.commit()
    db.expire_all()
    return await _load_session(session_id, db)


@router.get("/share/{share_token}", response_model=SessionOut)
async def get_shared_session(
    share_token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """Read-only public session view by unguessable share token."""
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.share_token == share_token)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.performed_sets),
            selectinload(WorkoutSession.planned_exercises).selectinload(PlannedExercise.exercise),
        )
    )
    result = await db.execute(stmt)
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shared session not found")
    return s


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Get a full session with exercises and performed sets."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    return s


@router.post("/{session_id}/exercises/{planned_id}/sets", response_model=SessionOut)
async def log_set(
    session_id: int,
    planned_id: int,
    body: PerformedSetCreate,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Log a performed set for a planned exercise."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    pe = await db.get(PlannedExercise, planned_id)
    if not pe or pe.session_id != session_id:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

    # Idempotency guard: rapid duplicate submits (double-tap, retry) of the same
    # set land as identical rows within seconds. Return current state instead.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for existing in pe.performed_sets or []:
        if (
            existing.set_number == body.set_number
            and existing.weight == body.weight
            and existing.reps == body.reps
            and abs((now - existing.timestamp).total_seconds()) < 30
        ):
            return await _load_session(session_id, db)

    ps = PerformedSet(
        planned_exercise_id=planned_id,
        set_number=body.set_number,
        weight=body.weight,
        reps=body.reps,
        rpe=body.rpe,
        sensation=body.sensation,
        notes=body.notes,
    )
    db.add(ps)

    if s.status == "planned":
        s.status = "in_progress"
        if not s.started_at:
            s.started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    logged_sets = len(pe.performed_sets or []) + 1
    if logged_sets >= pe.target_sets:
        pe.status = "completed"
    elif pe.status == "pending":
        pe.status = "in_progress"

    await db.commit()
    # Expire cached objects so the reload includes the set we just inserted
    # (expire_on_commit=False keeps the identity map otherwise).
    db.expire_all()
    return await _load_session(session_id, db)


@router.delete("/{session_id}/exercises/{planned_id}/sets/{set_id}", response_model=SessionOut)
async def delete_set(
    session_id: int,
    planned_id: int,
    set_id: int,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Delete a performed set (fix a wrongly logged one)."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    pe = await db.get(PlannedExercise, planned_id)
    if not pe or pe.session_id != session_id:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")
    ps = await db.get(PerformedSet, set_id)
    if not ps or ps.planned_exercise_id != planned_id:
        raise HTTPException(status_code=404, detail="Set not found in this exercise")
    await db.delete(ps)
    if pe.status == "completed":
        pe.status = "in_progress"
    await db.commit()
    db.expire_all()
    return await _load_session(session_id, db)


@router.post("/{session_id}/finish", response_model=SessionOut)
async def finish_session(
    session_id: int,
    body: SessionFinish,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Finish a workout session, save feedback and actual duration."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)

    s.status = "completed"
    # Auto-calculate duration from started_at if not provided.
    if body.duration_actual:
        s.duration_actual = body.duration_actual
    elif s.started_at:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        delta = (now - s.started_at).total_seconds()
        s.duration_actual = max(1, int(delta / 60))
    else:
        s.duration_actual = body.duration_actual
    s.feedback = body.feedback
    s.energy = body.energy
    s.discomfort = body.discomfort

    await db.commit()
    return await _load_session(session_id, db)


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """Delete a session (e.g. discard a plan preview the athlete rejected)."""
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    for pe in s.planned_exercises or []:
        for ps in pe.performed_sets or []:
            await db.delete(ps)
        await db.delete(pe)
    await db.delete(s)
    await db.commit()
    return {"deleted": session_id}


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = 10,
    db: AsyncSession = Depends(get_db_session),
    uid: Optional[int] = Depends(current_user_id),
):
    """List last N sessions with summary info."""
    stmt = (
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.planned_exercises).selectinload(
                PlannedExercise.performed_sets
            )
        )
    )
    if uid:
        stmt = stmt.where(WorkoutSession.telegram_user_id == uid)
    stmt = stmt.order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc()).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return [
        SessionSummary(
            id=s.id,
            session_date=s.session_date,
            title=s.title,
            status=s.status,
            energy=s.energy,
            duration_actual=s.duration_actual,
            exercise_count=len(s.planned_exercises or []),
            total_sets=sum(len(pe.performed_sets or []) for pe in (s.planned_exercises or [])),
        )
        for s in sessions
    ]