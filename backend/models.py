from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel, Relationship


class Exercise(SQLModel, table=True):
    __tablename__ = "exercises"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    muscle_group: str = Field(index=True)
    secondary_muscles: str = Field(default="")
    equipment: str = Field(default="")
    instructions: str = Field(default="")
    image_url: str = Field(default="")
    gif_url: str = Field(default="")
    source: str = Field(default="free-exercise-db")
    alternatives: str = Field(default="")

    planned_exercises: list["PlannedExercise"] = Relationship(back_populates="exercise")


class WorkoutSession(SQLModel, table=True):
    __tablename__ = "workout_sessions"

    id: int = Field(default=None, primary_key=True)
    session_date: date = Field(default_factory=lambda: date.today(), index=True)
    title: str = Field(default="")
    goal: str = Field(default="")
    status: str = Field(default="planned")
    energy: int = Field(default=5, ge=1, le=10)
    discomfort: str = Field(default="")
    duration_estimated: int = Field(default=0)
    duration_actual: int = Field(default=0)
    feedback: str = Field(default="")
    coach_summary: str = Field(default="")
    share_token: str = Field(default_factory=lambda: uuid4().hex)
    telegram_user_id: Optional[int] = Field(default=None, index=True)

    planned_exercises: list["PlannedExercise"] = Relationship(back_populates="session")


class PlannedExercise(SQLModel, table=True):
    __tablename__ = "planned_exercises"

    id: int = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="workout_sessions.id")
    exercise_id: int = Field(foreign_key="exercises.id")
    order: int = Field(default=0)
    target_sets: int = Field(default=3)
    target_reps: int = Field(default=10)
    suggested_weight: float = Field(default=0.0)
    notes: str = Field(default="")
    status: str = Field(default="pending")

    session: "WorkoutSession" = Relationship(back_populates="planned_exercises")
    exercise: "Exercise" = Relationship(back_populates="planned_exercises")
    performed_sets: list["PerformedSet"] = Relationship(back_populates="planned_exercise")


class PerformedSet(SQLModel, table=True):
    __tablename__ = "performed_sets"

    id: int = Field(default=None, primary_key=True)
    planned_exercise_id: int = Field(foreign_key="planned_exercises.id")
    set_number: int = Field(default=1)
    weight: float = Field(default=0.0)
    reps: int = Field(default=0)
    rpe: Optional[float] = Field(default=None, ge=1.0, le=10.0)
    sensation: str = Field(default="")
    notes: str = Field(default="")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    planned_exercise: "PlannedExercise" = Relationship(back_populates="performed_sets")


class AthleteProfile(SQLModel, table=True):
    __tablename__ = "athlete_profiles"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(default="Athlete")
    telegram_user_id: Optional[int] = Field(default=None, index=True)
    age: Optional[int] = Field(default=None)
    height_cm: Optional[float] = Field(default=None)
    weight_kg: Optional[float] = Field(default=None)
    goal: str = Field(default="")
    experience_level: str = Field(default="")
    training_days_per_week: Optional[int] = Field(default=None)
    usual_session_minutes: Optional[int] = Field(default=None)
    injuries: str = Field(default="")
    limitations: str = Field(default="")
    preferred_exercises: str = Field(default="")
    disliked_exercises: str = Field(default="")
    gym_name: str = Field(default="")
    available_equipment: str = Field(default="")
    unavailable_equipment: str = Field(default="")
    notes: str = Field(default="")
    onboarding_complete: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
