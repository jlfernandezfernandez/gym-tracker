"""Muscle recovery & fatigue decay engine based on half-life decay.

Tracks systemic and per-muscle fatigue over time using an exponential decay model
with a 36-hour half-life.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

FATIGUE_HALF_LIFE_HOURS = 36.0
FATIGUE_REF_VOLUME = 2000.0  # kg of weighted volume representing a standard hard session
BODYWEIGHT_REF_LOAD = 75.0  # kg assumed for bodyweight exercises when unweighted
CARDIO_REF_LOAD_PER_MIN = 50.0  # equivalent load per cardio minute


def _parse_muscles(exercise: Any) -> tuple[str, list[str]]:
    primary = (exercise.muscle_group or exercise.target or exercise.body_part or "").strip().lower()
    secondary_raw = (exercise.secondary_muscles or "").strip().lower()
    secondary = [m.strip() for m in secondary_raw.split(",") if m.strip()] if secondary_raw else []
    return primary, secondary


def calculate_muscle_readiness(
    sessions: list[Any],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Calculate muscle recovery state from historical completed sessions."""
    if now is None:
        now = datetime.now(UTC).replace(tzinfo=None)

    muscle_stimuli: dict[str, float] = {}
    last_trained: dict[str, datetime] = {}

    for session in sessions:
        if session.status != "completed":
            continue
        session_time = session.started_at or datetime.combine(
            session.session_date, datetime.min.time()
        )
        hours_ago = max(0.0, (now - session_time).total_seconds() / 3600.0)
        # Bounded scan: sessions older than 30 days contribute < 0.0001
        if hours_ago > 30 * 24:
            continue

        decay_factor = math.pow(0.5, hours_ago / FATIGUE_HALF_LIFE_HOURS)

        for planned in session.planned_exercises or []:
            exercise = planned.exercise
            if not exercise:
                continue

            primary, secondary = _parse_muscles(exercise)
            if not primary:
                continue

            # Calculate total tonnage for this exercise in this session
            exercise_tonnage = 0.0
            for performed in planned.performed_sets or []:
                if performed.is_warmup:
                    continue
                if exercise.is_cardio:
                    mins = performed.duration_minutes or 0
                    exercise_tonnage += mins * CARDIO_REF_LOAD_PER_MIN
                else:
                    reps = performed.reps or 0
                    weight = performed.weight
                    if weight is not None and weight > 0:
                        exercise_tonnage += weight * reps
                    else:
                        exercise_tonnage += BODYWEIGHT_REF_LOAD * reps

            if exercise_tonnage <= 0:
                continue

            # Primary muscle gets 100% stimulus, secondary gets 50%
            decayed = exercise_tonnage * decay_factor
            muscle_stimuli[primary] = muscle_stimuli.get(primary, 0.0) + decayed
            if primary not in last_trained or session_time > last_trained[primary]:
                last_trained[primary] = session_time

            for sec in secondary:
                muscle_stimuli[sec] = muscle_stimuli.get(sec, 0.0) + (decayed * 0.5)
                if sec not in last_trained or session_time > last_trained[sec]:
                    last_trained[sec] = session_time

    # Calculate per-muscle readiness and fatigue
    muscles_report = {}
    for muscle, stimulus in muscle_stimuli.items():
        # Fatigue saturates from 0.0 to 1.0 using 1 - exp(-stimulus / REF)
        fatigue = 1.0 - math.exp(-stimulus / FATIGUE_REF_VOLUME)
        readiness_pct = max(0, min(100, round((1.0 - fatigue) * 100)))

        status = (
            "ready"
            if readiness_pct >= 75
            else ("recovering" if readiness_pct >= 45 else "fatigued")
        )
        last_dt = last_trained.get(muscle)
        hours_since = round((now - last_dt).total_seconds() / 3600.0, 1) if last_dt else None

        muscles_report[muscle] = {
            "muscle": muscle,
            "readiness_pct": readiness_pct,
            "fatigue_pct": round(fatigue * 100),
            "status": status,
            "hours_since_trained": hours_since,
        }

    # Group muscles into buckets for the AI coach
    ready_muscles = [m["muscle"] for m in muscles_report.values() if m["status"] == "ready"]
    recovering_muscles = [
        m["muscle"] for m in muscles_report.values() if m["status"] == "recovering"
    ]
    fatigued_muscles = [m["muscle"] for m in muscles_report.values() if m["status"] == "fatigued"]

    return {
        "muscles": muscles_report,
        "ready": ready_muscles,
        "recovering": recovering_muscles,
        "fatigued": fatigued_muscles,
    }
