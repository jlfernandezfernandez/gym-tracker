from datetime import datetime

from pydantic import BaseModel, Field


class AthleteProfileIn(BaseModel):
    name: str = "Athlete"
    age: int | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    goal: str = ""
    experience_level: str = ""
    preferred_exercises: str = ""
    notes: str = ""
    onboarding_complete: bool = False


class AthleteProfilePatch(BaseModel):
    name: str | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    height_cm: float | None = Field(default=None, gt=0, le=300)
    weight_kg: float | None = Field(default=None, gt=0, le=500)
    goal: str | None = None
    experience_level: str | None = None
    preferred_exercises: str | None = None
    notes: str | None = None
    onboarding_complete: bool | None = None


class AthleteProfileOut(AthleteProfileIn):
    id: int
    updated_at: datetime


class AthleteMeasurementIn(BaseModel):
    measured_at: datetime | None = None
    source: str = "manual"
    weight_kg: float | None = Field(default=None, ge=0)
    muscle_kg: float | None = Field(default=None, ge=0)
    fat_kg: float | None = Field(default=None, ge=0)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    visceral_fat: float | None = Field(default=None, ge=0)
    notes: str = ""


class AthleteMeasurementOut(AthleteMeasurementIn):
    id: int
    measured_at: datetime
