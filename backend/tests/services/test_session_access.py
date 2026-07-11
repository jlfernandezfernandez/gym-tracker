import pytest
from fastapi import HTTPException

from app.models import WorkoutSession
from app.services.sessions import check_session_owner


def test_user_cannot_touch_another_users_session() -> None:
    with pytest.raises(HTTPException) as error:
        check_session_owner(WorkoutSession(telegram_user_id=7), 42)
    assert error.value.status_code == 403


def test_authenticated_user_cannot_claim_unowned_session() -> None:
    with pytest.raises(HTTPException) as error:
        check_session_owner(WorkoutSession(telegram_user_id=None), 42)
    assert error.value.status_code == 403


def test_owner_is_allowed() -> None:
    check_session_owner(WorkoutSession(telegram_user_id=42), 42)


def test_trusted_caller_without_user_id_is_allowed() -> None:
    """Coach key or dev mode: current_user_id yields None only after auth."""
    check_session_owner(WorkoutSession(telegram_user_id=42), None)
