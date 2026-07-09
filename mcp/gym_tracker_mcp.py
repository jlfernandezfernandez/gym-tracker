#!/usr/bin/env python3
"""MCP tools for the gym-tracker product API.

The coach talks to this MCP; the MCP talks to the public FastAPI app.
No database credentials, no direct DB writes, no Telegram token here.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

API_BASE = os.getenv("GYM_TRACKER_API_BASE", "http://localhost:8000/api").rstrip("/")
APP_BASE = os.getenv("GYM_TRACKER_APP_BASE", "http://localhost:8000").rstrip("/")
COACH_KEY = os.getenv("GYM_TRACKER_COACH_KEY", "")

mcp = FastMCP("gym-tracker")


def _request(method: str, path: str, payload: dict[str, Any] | None = None, user_id: int | None = None) -> Any:
    """Send an HTTP request to the gym-tracker API and return parsed JSON.

    Raises RuntimeError with the API error detail on non-2xx responses.
    """
    url = f"{API_BASE}{path}"
    data = None
    headers = {"Accept": "application/json", "User-Agent": "gym-tracker-mcp/1.0 (+https://gym.jordixlab.com)"}
    if COACH_KEY:
        headers["X-Coach-Key"] = COACH_KEY
    if user_id is not None:
        headers["X-Telegram-User-Id"] = str(user_id)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {"ok": True}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"API {method} {path} → HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error calling {method} {path}: {exc.reason}") from exc


@mcp.tool()
def health() -> dict[str, Any]:
    """Check if the gym-tracker API is online and healthy."""
    return _request("GET", "/health")


@mcp.tool()
def get_athlete_profile(telegram_user_id: int | None = None) -> dict[str, Any]:
    """Read the athlete's profile: goals, body metrics, injuries, gym equipment, preferences, and onboarding status.

    Always call this before creating a plan. If onboarding_complete is false,
    start the onboarding conversation first.
    telegram_user_id: Telegram id of the athlete you are talking to. Omit only on single-user instances.
    """
    return _request("GET", "/profile", user_id=telegram_user_id)


@mcp.tool()
def patch_athlete_profile(updates_json: str, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Update athlete profile fields from a JSON object string.

    Use after onboarding (include "onboarding_complete": true) and for any
    incremental facts learned in chat (injuries, equipment, preferences...).
    Example: {"goal": "hipertrofia", "injuries": "hombro izquierdo", "onboarding_complete": true}
    """
    updates = json.loads(updates_json or "{}")
    if not isinstance(updates, dict):
        raise ValueError("updates_json must be a JSON object")
    return _request("PATCH", "/profile", updates, user_id=telegram_user_id)


@mcp.tool()
def list_exercises(search: str = "", muscle_group: str = "", limit: int = 10) -> list[dict[str, Any]]:
    """Search the exercise catalog by name and/or muscle group."""
    params: dict[str, Any] = {"limit": max(1, min(int(limit), 50))}
    if search:
        params["search"] = search
    if muscle_group:
        params["muscle_group"] = muscle_group
    qs = urllib.parse.urlencode(params)
    return _request("GET", f"/exercises?{qs}")


@mcp.tool()
def get_exercise(exercise_id: int) -> dict[str, Any]:
    """Get full detail of one catalog exercise: instructions, muscles, equipment, image."""
    return _request("GET", f"/exercises/{int(exercise_id)}")


@mcp.tool()
def list_muscle_groups() -> list[str]:
    """List available exercise muscle groups."""
    return _request("GET", "/exercises/muscle-groups")


@mcp.tool()
def exercise_progress(exercise_id: int, limit: int = 20, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """Progression of one exercise across sessions: date, top weight, volume, sets. Use it to talk progress and choose next weights."""
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 100))})
    return _request("GET", f"/exercises/{int(exercise_id)}/progress?{qs}", user_id=telegram_user_id)


@mcp.tool()
def get_session(session_id: int) -> dict[str, Any]:
    """Get a workout session with planned exercises and logged sets."""
    return _request("GET", f"/sessions/{int(session_id)}")


@mcp.tool()
def get_today_session(telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get today's latest workout session."""
    return _request("GET", "/sessions/today", user_id=telegram_user_id)


@mcp.tool()
def list_sessions(limit: int = 10, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """List recent workout sessions (summary: date, title, status, sets). Use it to adapt new plans to recent training."""
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 50))})
    return _request("GET", f"/sessions?{qs}", user_id=telegram_user_id)


@mcp.tool()
def get_active_session(telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get latest non-completed session plus derived current exercise/set state."""
    return _request("GET", "/sessions/active", user_id=telegram_user_id)


@mcp.tool()
def get_current_state(session_id: int) -> dict[str, Any]:
    """Get derived current planned exercise and next set for a session."""
    return _request("GET", f"/sessions/{int(session_id)}/current")


@mcp.tool()
def complete_exercise(session_id: int, planned_exercise_id: int) -> dict[str, Any]:
    """Mark the current/selected planned exercise as completed."""
    return _request("POST", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/complete")


@mcp.tool()
def delete_session(session_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Delete a workout session. Use to discard a plan preview the athlete rejected before creating a new one."""
    return _request("DELETE", f"/sessions/{int(session_id)}", user_id=telegram_user_id)


@mcp.tool()
def create_plan(title: str = "", goal: str = "", energy: int = 5, time_available: int = 45, discomfort: str = "", exercises_json: str = "", telegram_user_id: int | None = None) -> dict[str, Any]:
    """Create a workout plan owned by the Telegram athlete.

    CRITICAL: telegram_user_id is required. Without it the API would create an
    unscoped session that share links can open, but the Telegram Mini App cannot
    show as the athlete's active session.

    exercises_json: JSON array of the exercises you picked from list_exercises, e.g.
    [{"exercise_id": 12, "order": 0, "target_sets": 3, "target_reps": 10,
      "suggested_weight": 40.0, "notes": "controla la bajada"}]
    If empty, the API picks a generic fallback plan — always pick exercises yourself.
    """
    if telegram_user_id is None:
        raise ValueError(
            "telegram_user_id is required for create_plan so the Mini App can show "
            "the workout as the athlete's active session. Pass the Telegram user id "
            "from the current chat/context."
        )
    exercises = json.loads(exercises_json) if exercises_json else []
    if not isinstance(exercises, list):
        raise ValueError("exercises_json must be a JSON array")
    return _request("POST", "/coach/plan", {
        "title": title,
        "goal": goal,
        "energy": int(energy),
        "time_available": int(time_available),
        "discomfort": discomfort,
        "exercises": exercises,
    }, user_id=telegram_user_id)


@mcp.tool()
def log_set(session_id: int, planned_exercise_id: int, set_number: int, weight: float = 0.0, reps: int = 0, rpe: float | None = None, sensation: str = "", notes: str = "") -> dict[str, Any]:
    """Log one performed set for a planned exercise."""
    payload: dict[str, Any] = {
        "set_number": int(set_number),
        "weight": float(weight),
        "reps": int(reps),
        "sensation": sensation,
        "notes": notes,
    }
    if rpe is not None:
        payload["rpe"] = float(rpe)
    return _request("POST", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets", payload)


@mcp.tool()
def delete_set(session_id: int, planned_exercise_id: int, set_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Delete a wrongly logged set (the athlete corrected themselves). Set ids come in session responses."""
    return _request("DELETE", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets/{int(set_id)}", user_id=telegram_user_id)


@mcp.tool()
def update_planned_exercise(session_id: int, planned_exercise_id: int, status: str = "completed", new_exercise_id: int | None = None, notes: str = "") -> dict[str, Any]:
    """Mark an exercise completed/skipped/changed; optionally replace it with another catalog exercise."""
    payload: dict[str, Any] = {"status": status, "notes": notes}
    if new_exercise_id is not None:
        payload["new_exercise_id"] = int(new_exercise_id)
    return _request("PUT", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}", payload)


@mcp.tool()
def finish_session(session_id: int, duration_actual: int = 0, feedback: str = "", energy: int = 5, discomfort: str = "") -> dict[str, Any]:
    """Finish a workout session and store final feedback."""
    return _request("POST", f"/sessions/{int(session_id)}/finish", {
        "duration_actual": int(duration_actual),
        "feedback": feedback,
        "energy": int(energy),
        "discomfort": discomfort,
    })


@mcp.tool()
def list_measurements(limit: int = 20, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """List historical body measurements: weight, muscle, fat, score, source and date."""
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 100))})
    return _request("GET", f"/profile/measurements?{qs}", user_id=telegram_user_id)


@mcp.tool()
def add_measurement(measurement_json: str, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Add a generic body measurement from any source.

    measurement_json example:
    {"source":"smart_scale","measured_at":"2026-07-09T10:00:00","weight_kg":72.3,
     "muscle_kg":56.4,"fat_kg":12.9,"body_fat_pct":17.8,"score":787}
    Source is free text: manual, smart_scale, inbody, dexa, clinic, photo_checkin, etc.
    """
    if telegram_user_id is None:
        raise ValueError("telegram_user_id is required so measurements are attached to the athlete profile")
    body = json.loads(measurement_json or "{}")
    if not isinstance(body, dict):
        raise ValueError("measurement_json must be a JSON object")
    return _request("POST", "/profile/measurements", body, user_id=telegram_user_id)


@mcp.tool()
def body_measurement_history(limit: int = 20, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """List Jordi's historical body measurements.

    Use this instead of reading profile.weight_kg when talking about evolution.
    Returns dated measurements from any source: manual, smart scale, medical scan,
    body-composition device, photos/check-ins, etc.
    """
    return list_measurements(limit=limit, telegram_user_id=telegram_user_id)


@mcp.tool()
def record_body_measurement(
    telegram_user_id: int,
    source: str = "manual",
    measured_at: str = "",
    weight_kg: float | None = None,
    muscle_kg: float | None = None,
    fat_kg: float | None = None,
    body_fat_pct: float | None = None,
    visceral_fat: float | None = None,
    score: float | None = None,
    notes: str = "",
) -> dict[str, Any]:
    """Record a generic dated body measurement.

    Preferred tool when Jordi sends weight, body-composition, medical measurement,
    smart-scale data, photos/check-in notes, or any future measurement source.
    `source` is free text (manual, smart_scale, inbody, dexa, clinic, etc.).
    Do not overwrite profile notes; store each measurement with measured_at/source.
    measured_at can be ISO datetime/date. Empty means now.
    """
    if not source:
        source = "manual"
    body: dict[str, Any] = {"source": source, "notes": notes}
    if measured_at:
        body["measured_at"] = measured_at
    for key, value in {
        "weight_kg": weight_kg,
        "muscle_kg": muscle_kg,
        "fat_kg": fat_kg,
        "body_fat_pct": body_fat_pct,
        "visceral_fat": visceral_fat,
        "score": score,
    }.items():
        if value is not None:
            body[key] = float(value)
    return _request("POST", "/profile/measurements", body, user_id=telegram_user_id)


@mcp.tool()
def session_web_url(session_id: int, planned_exercise_id: int | None = None) -> str:
    """Return a Mini App URL for a session or a specific exercise screen.

    User-facing links must not expose sequential session ids. Resolve the
    session through the API using the coach key, then build a share-token URL.
    """
    session = _request("GET", f"/sessions/{int(session_id)}")
    token = urllib.parse.quote(str(session["share_token"]), safe="")
    url = f"{APP_BASE}/session/share/{token}"
    if planned_exercise_id is not None:
        url += f"/exercise/{int(planned_exercise_id)}"
    return url


@mcp.tool()
def share_web_url(share_token: str) -> str:
    """Return a read-only share URL for a companion."""
    token = urllib.parse.quote(str(share_token), safe="")
    return f"{APP_BASE}/session/share/{token}"


if __name__ == "__main__":
    mcp.run()
