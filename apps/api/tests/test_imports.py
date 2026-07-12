from app.core.database import get_session
from app.features.sessions.schemas import SessionOut
from app.models import Exercise, WorkoutSession
from app.router import api_router


def test_backend_modules_have_stable_package_imports() -> None:
    assert api_router.prefix == "/api"
    assert callable(get_session)
    assert Exercise.__tablename__ == "exercises"
    assert WorkoutSession.__tablename__ == "workout_sessions"
    assert "total_volume" in SessionOut.model_fields
