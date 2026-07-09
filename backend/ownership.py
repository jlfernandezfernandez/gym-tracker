"""Helpers for assigning legacy unscoped data to a Telegram user.

Early coach-created sessions/profile may not have telegram_user_id because they
were created by the MCP with admin/coach access before the Mini App identity was
wired. In the Telegram Mini App, every request has a signed Telegram user id, so
we adopt legacy unscoped rows for the first real authenticated user instead of
showing an empty "Athlete" profile.
"""
from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import AthleteProfile, WorkoutSession


def _profile_has_data(profile: AthleteProfile) -> bool:
    """Return True if the profile looks like real onboarding data, not default."""
    return any([
        profile.name and profile.name != "Athlete",
        profile.goal,
        profile.experience_level,
        profile.injuries,
        profile.gym_name,
        profile.notes,
        profile.onboarding_complete,
    ])


async def adopt_legacy_unscoped_data(db: AsyncSession, uid: int | None) -> None:
    """Attach legacy unscoped profile/sessions to an authenticated Telegram user.

    Safe transition rule:
    - If uid is missing, do nothing.
    - If the user already has a real profile/session, do nothing for that table.
    - If there is exactly one useful unscoped profile, claim it for uid. If a
      default empty profile was already auto-created for uid, merge the useful
      profile into it and delete the empty duplicate.
    - If the user has no sessions, claim all unscoped sessions for uid.

    This preserves privacy for future multi-user data while fixing the original
    single-user bootstrap state.
    """
    if uid is None:
        return

    existing_profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.telegram_user_id == uid).limit(1)
        )
    ).scalar_one_or_none()

    unscoped_profiles = (
        await db.execute(
            select(AthleteProfile)
            .where(AthleteProfile.telegram_user_id == None)  # noqa: E711
            .order_by(AthleteProfile.id)
        )
    ).scalars().all()
    useful_profiles = [p for p in unscoped_profiles if _profile_has_data(p)]

    if len(useful_profiles) == 1:
        legacy = useful_profiles[0]
        if existing_profile is None:
            legacy.telegram_user_id = uid
            await db.flush()
        elif not _profile_has_data(existing_profile):
            # A blank "Athlete" profile was likely created by the first Mini
            # App open. Keep its user-bound row, copy the real legacy profile
            # into it, and remove the duplicate unscoped row.
            for attr in [
                "name",
                "age",
                "height_cm",
                "weight_kg",
                "goal",
                "experience_level",
                "training_days_per_week",
                "usual_session_minutes",
                "injuries",
                "limitations",
                "preferred_exercises",
                "disliked_exercises",
                "gym_name",
                "available_equipment",
                "unavailable_equipment",
                "notes",
                "onboarding_complete",
                "updated_at",
            ]:
                setattr(existing_profile, attr, getattr(legacy, attr))
            await db.delete(legacy)
            await db.flush()

    existing_session = (
        await db.execute(
            select(WorkoutSession.id).where(WorkoutSession.telegram_user_id == uid).limit(1)
        )
    ).scalar_one_or_none()

    if existing_session is None:
        await db.execute(
            update(WorkoutSession)
            .where(WorkoutSession.telegram_user_id == None)  # noqa: E711
            .values(telegram_user_id=uid)
        )

    await db.commit()
