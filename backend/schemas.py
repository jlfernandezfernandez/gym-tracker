from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Session ──

class PlannedExerciseCreate(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int = Field(default=10, ge=1)
    suggested_weight: float = Field(default=0.0, ge=0)
    notes: str = ""


class PerformedSetCreate(BaseModel):
    set_number: int = Field(ge=1)
    weight: float = Field(default=0.0, ge=0)
    reps: int = Field(ge=1)
    rpe: Optional[float] = None
    sensation: str = ""
    notes: str = ""


class PlannedExerciseUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "completed", "skipped", "changed"]] = None
    new_exercise_id: Optional[int] = None
    notes: Optional[str] = None


class SessionFinish(BaseModel):
    # None = let the backend compute from started_at (issue #8).
    duration_actual: Optional[int] = None
    feedback: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""


# ── Coach ──

class CoachPlanRequest(BaseModel):
    title: str = ""
    goal: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""
    time_available: int = Field(default=45, ge=1, le=1440)
    exercises: list[PlannedExerciseCreate] = Field(default_factory=list)


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


class AthleteMeasurementOut(AthleteMeasurementIn):
    id: int
    measured_at: datetime


# ── Response schemas ──

class ExerciseOut(BaseModel):
    id: int
    external_id: str = ""
    name: str
    name_en: str = ""
    name_es: str = ""
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
    performed_sets: list[PerformedSetOut] = Field(default_factory=list)


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
    planned_exercises: list[PlannedExerciseOut] = Field(default_factory=list)


class ExerciseFacets(BaseModel):
    muscle_groups: list[str]
    body_parts: list[str]
    equipment: list[str]


class SessionSummary(BaseModel):
    id: int
    session_date: date
    title: str
    status: str
    energy: int
    duration_actual: int
    exercise_count: int
    total_sets: int
