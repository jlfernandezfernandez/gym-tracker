from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class PlannedExerciseCreate(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    target_sets: int = Field(default=3, ge=1)
    target_reps: int = Field(default=10, ge=1)
    suggested_weight: float = Field(default=0.0, ge=-1)
    notes: str = ""


class PerformedSetCreate(BaseModel):
    set_number: int = Field(ge=1)
    weight: float = Field(default=0.0, ge=-1)
    reps: int = Field(ge=1)
    rpe: Optional[float] = None
    sensation: str = ""
    notes: str = ""


class PlannedExerciseUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "completed", "skipped"]] = None
    new_exercise_id: Optional[int] = None
    target_sets: Optional[int] = Field(default=None, ge=1, le=20)
    notes: Optional[str] = None


class SessionUpdate(BaseModel):
    session_date: Optional[date] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    goal: Optional[str] = None
    feedback: Optional[str] = None
    coach_summary: Optional[str] = None
    discomfort: Optional[str] = None
    energy: Optional[int] = Field(default=None, ge=1, le=10)
    duration_actual: Optional[int] = Field(default=None, ge=0)


class SessionFinish(BaseModel):
    duration_actual: Optional[int] = None
    feedback: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""


class CoachPlanRequest(BaseModel):
    title: str = ""
    goal: str = ""
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = ""
    time_available: int = Field(default=45, ge=1, le=1440)
    exercises: list[PlannedExerciseCreate] = Field(default_factory=list)


class ImportSet(BaseModel):
    weight: float = Field(default=0.0, ge=-1)
    reps: int = Field(ge=1)
    rpe: Optional[float] = Field(default=None, ge=1, le=10)
    notes: str = ""


class ImportExercise(BaseModel):
    exercise_id: int = Field(gt=0)
    order: int = Field(default=0, ge=0)
    notes: str = ""
    sets: list[ImportSet] = Field(min_length=1)


class CoachImportRequest(BaseModel):
    session_date: date
    title: str = ""
    feedback: str = ""
    duration_actual: int = Field(default=0, ge=0)
    exercises: list[ImportExercise] = Field(min_length=1)


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
    weight_mode: Literal["bodyweight", "unloaded", "weighted"]
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
    weight_mode: Literal["bodyweight", "unloaded", "weighted"]
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
    total_volume: float
    planned_exercises: list[PlannedExerciseOut] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: int
    session_date: date
    title: str
    status: str
    energy: int
    duration_actual: int
    exercise_count: int
    total_sets: int
