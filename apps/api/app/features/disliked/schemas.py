from datetime import datetime

from pydantic import BaseModel, Field


class DislikedExerciseIn(BaseModel):
    exercise_id: int = Field(gt=0)


class DislikedExerciseOut(BaseModel):
    id: int
    athlete_id: int
    exercise_id: int
    created_at: datetime
    name: str = ""
    name_en: str = ""
    muscle_group: str = ""
    equipment: str = ""
    image_url: str = ""
