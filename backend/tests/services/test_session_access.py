import pytest
from fastapi import HTTPException

from app.models import WorkoutSession
from app.services.sessions import check_session_owner


def test_authenticated_user_cannot_claim_unowned_session() -> None:
    with pytest.raises(HTTPException) as error:
        check_session_owner(WorkoutSession(telegram_user_id=None), 42, auth_disabled=False)
    assert error.value.status_code == 403


def test_explicit_development_mode_allows_unscoped_session() -> None:
    check_session_owner(WorkoutSession(telegram_user_id=None), None, auth_disabled=True)
