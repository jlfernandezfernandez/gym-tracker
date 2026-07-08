from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from database import get_session as get_db_session
from telegram_auth import get_telegram_user_id
from models import WorkoutSession, PlannedExercise, PerformedSet
from schemas import (
    SessionCreate,
    SessionOut,
    SessionSummary,
    PerformedSetCreate,
    SessionFinish,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _uid(init_data: Optional[str], coach_key: Optional[str]) -> Optional[int]:
    return get_telegram_user_id(init_data, coach_key)


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
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Create a full session with planned exercises."""
    uid = _uid(init_data, coach_key)
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
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Get today's latest session if it exists."""
    uid = _uid(init_data, coach_key)
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
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Get latest non-completed session with derived current exercise state."""
    uid = _uid(init_data, coach_key)
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
    return {"session": s, "current": _current_state(s)}


@router.get("/{session_id}/current")
async def get_current_exercise(
    session_id: int,
    db: AsyncSession = Depends(get_db_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Get derived current exercise/set for the agent and Mini App."""
    uid = _uid(init_data, coach_key)
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    return _current_state(s)


@router.post("/{session_id}/exercises/{planned_id}/complete", response_model=SessionOut)
async def complete_planned_exercise(
    session_id: int,
    planned_id: int,
    db: AsyncSession = Depends(get_db_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Mark one planned exercise completed and keep session active."""
    uid = _uid(init_data, coach_key)
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
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Get a full session with exercises and performed sets."""
    uid = _uid(init_data, coach_key)
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    return s


@router.post("/{session_id}/exercises/{planned_id}/sets", response_model=SessionOut)
async def log_set(
    session_id: int,
    planned_id: int,
    body: PerformedSetCreate,
    db: AsyncSession = Depends(get_db_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Log a performed set for a planned exercise."""
    uid = _uid(init_data, coach_key)
    s = await _load_session(session_id, db)
    _check_owner(s, uid)
    pe = await db.get(PlannedExercise, planned_id)
    if not pe or pe.session_id != session_id:
        raise HTTPException(status_code=404, detail="Planned exercise not found in this session")

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

    logged_sets = len(pe.performed_sets or []) + 1
    if logged_sets >= pe.target_sets:
        pe.status = "completed"
    elif pe.status == "pending":
        pe.status = "in_progress"

    await db.commit()
    return await _load_session(session_id, db)


@router.post("/{session_id}/finish", response_model=SessionOut)
async def finish_session(
    session_id: int,
    body: SessionFinish,
    db: AsyncSession = Depends(get_db_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """Finish a workout session, save feedback and actual duration."""
    uid = _uid(init_data, coach_key)
    s = await _load_session(session_id, db)
    _check_owner(s, uid)

    s.status = "completed"
    s.duration_actual = body.duration_actual
    s.feedback = body.feedback
    s.energy = body.energy
    s.discomfort = body.discomfort

    await db.commit()
    return await _load_session(session_id, db)


@router.get("", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = 10,
    db: AsyncSession = Depends(get_db_session),
    init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    coach_key: Optional[str] = Header(None, alias="X-Coach-Key"),
):
    """List last N sessions with summary info."""
    uid = _uid(init_data, coach_key)
    stmt = (
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.planned_exercises))
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