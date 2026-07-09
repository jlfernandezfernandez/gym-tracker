from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Session ──

class PlannedExerciseCreate(BaseModel):
    exercise_id: int
    order: int = 0
    target_sets: int = 3
    target_reps: int = 10
    suggested_weight: float = 0.0
    notes: str = ""


class SessionCreate(BaseModel):
    title: str = ""
    goal: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""
    duration_estimated: int = 0
    exercises: list[PlannedExerciseCreate] = []


class PerformedSetCreate(BaseModel):
    set_number: int
    weight: float = 0.0
    reps: int = 0
    rpe: Optional[float] = None
    sensation: str = ""
    notes: str = ""


class PlannedExerciseUpdate(BaseModel):
    status: Optional[str] = None
    new_exercise_id: Optional[int] = None
    notes: Optional[str] = None


class SessionFinish(BaseModel):
    duration_actual: int = 0
    feedback: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""


# ── Coach ──

class CoachPlanRequest(BaseModel):
    title: str = ""
    goal: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""
    time_available: int = 45
    exercises: list[PlannedExerciseCreate] = []


# ── Athlete profile / onboarding ──

class AthleteProfileIn(BaseModel):
    name: str = "Athlete"
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    goal: str = ""
    experience_level: str = ""
    training_days_per_week: Optional[int] = None
    usual_session_minutes: Optional[int] = None
    injuries: str = ""
    limitations: str = ""
    preferred_exercises: str = ""
    disliked_exercises: str = ""
    gym_name: str = ""
    available_equipment: str = ""
    unavailable_equipment: str = ""
    notes: str = ""
    onboarding_complete: bool = False


class AthleteProfileOut(AthleteProfileIn):
    id: int
    updated_at: datetime


# ── Athlete measurements ──

class AthleteMeasurementIn(BaseModel):
    measured_at: Optional[datetime] = None
    source: str = "manual"
    weight_kg: Optional[float] = None
    muscle_kg: Optional[float] = None
    fat_kg: Optional[float] = None
    body_fat_pct: Optional[float] = None
    visceral_fat: Optional[float] = None
    score: Optional[float] = None
    notes: str = ""


class AthleteMeasurementOut(BaseModel):
    id: int
    measured_at: datetime
    source: str = "manual"
    weight_kg: Optional[float] = None
    muscle_kg: Optional[float] = None
    fat_kg: Optional[float] = None
    body_fat_pct: Optional[float] = None
    visceral_fat: Optional[float] = None
    score: Optional[float] = None
    notes: str = ""


# ── Response schemas ──

class ExerciseOut(BaseModel):
    id: int
    external_id: str = ""
    name: str
    muscle_group: str
    secondary_muscles: str = ""
    target: str = ""
    body_part: str = ""
    equipment: str = ""
    instructions: str = ""
    instructions_es: str = ""
    image_url: str = ""
    gif_url: str = ""


class PerformedSetOut(BaseModel):
    id: int
    set_number: int
    weight: float
    reps: int
    rpe: Optional[float] = None
    sensation: str
    notes: str
    timestamp: datetime


class PlannedExerciseOut(BaseModel):
    id: int
    exercise_id: int
    order: int
    target_sets: int
    target_reps: int
    suggested_weight: float
    notes: str
    status: str
    exercise: Optional[ExerciseOut] = None
    performed_sets: list[PerformedSetOut] = []


class SessionOut(BaseModel):
    id: int
    session_date: date
    title: str
    goal: str
    status: str
    energy: int
    discomfort: str
    duration_estimated: int
    duration_actual: int
    feedback: str
    coach_summary: str
    share_token: str
    planned_exercises: list[PlannedExerciseOut] = []


class SessionSummary(BaseModel):
    id: int
    session_date: date
    title: str
    status: str
    energy: int
    duration_actual: int
    exercise_count: int
    total_sets: int
