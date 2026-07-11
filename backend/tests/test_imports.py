from app.api.router import api_router
from app.database import get_session
from app.models import Exercise, WorkoutSession
from app.schemas.sessions import SessionOut


def test_backend_modules_have_stable_package_imports() -> None:
    assert api_router.prefix == "/api"
    assert callable(get_session)
    assert str(Exercise.__tablename__) == "exercises"  # pyright: ignore[reportGeneralTypeIssues]
    assert str(WorkoutSession.__tablename__) == "workout_sessions"  # pyright: ignore[reportGeneralTypeIssues]
    assert "total_volume" in SessionOut.model_fields
