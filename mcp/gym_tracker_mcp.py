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

API_BASE = os.getenv("GYM_TRACKER_API_BASE", "https://gym.jordixlab.com/api").rstrip("/")
APP_BASE = os.getenv("GYM_TRACKER_APP_BASE", "https://gym.jordixlab.com").rstrip("/")
COACH_KEY = os.getenv("GYM_TRACKER_COACH_KEY", "")

mcp = FastMCP("gym-tracker")


def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    """Send an HTTP request to the gym-tracker API and return parsed JSON.

    Raises RuntimeError with the API error detail on non-2xx responses.
    """
    url = f"{API_BASE}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if COACH_KEY:
        headers["X-Coach-Key"] = COACH_KEY
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
def get_athlete_profile() -> dict[str, Any]:
    """Read the athlete's profile: goals, body metrics, injuries, gym equipment, preferences, and onboarding status.

    Always call this before creating a plan. If onboarding_complete is false,
    start the onboarding conversation first.
    """
    return _request("GET", "/profile")


@mcp.tool()
def update_athlete_profile(
    name: str | None = None,
    age: int | None = None,
    height_cm: float | None = None,
    weight_kg: float | None = None,
    goal: str = "",
    experience_level: str = "",
    training_days_per_week: int | None = None,
    usual_session_minutes: int | None = None,
    injuries: str = "",
    limitations: str = "",
    preferred_exercises: str = "",
    disliked_exercises: str = "",
    gym_name: str = "",
    available_equipment: str = "",
    unavailable_equipment: str = "",
    notes: str = "",
    onboarding_complete: bool = False,
) -> dict[str, Any]:
    """Update the athlete profile after onboarding or new preferences/equipment limitations."""
    payload: dict[str, Any] = {
        "goal": goal,
        "experience_level": experience_level,
        "injuries": injuries,
        "limitations": limitations,
        "preferred_exercises": preferred_exercises,
        "disliked_exercises": disliked_exercises,
        "gym_name": gym_name,
        "available_equipment": available_equipment,
        "unavailable_equipment": unavailable_equipment,
        "notes": notes,
        "onboarding_complete": onboarding_complete,
    }
    if name is not None:
        payload["name"] = name
    if age is not None:
        payload["age"] = int(age)
    if height_cm is not None:
        payload["height_cm"] = float(height_cm)
    if weight_kg is not None:
        payload["weight_kg"] = float(weight_kg)
    if training_days_per_week is not None:
        payload["training_days_per_week"] = int(training_days_per_week)
    if usual_session_minutes is not None:
        payload["usual_session_minutes"] = int(usual_session_minutes)
    return _request("PUT", "/profile", payload)


@mcp.tool()
def patch_athlete_profile(updates_json: str) -> dict[str, Any]:
    """Patch selected athlete profile fields from a JSON object string. Use for incremental facts learned in chat."""
    updates = json.loads(updates_json or "{}")
    if not isinstance(updates, dict):
        raise ValueError("updates_json must be a JSON object")
    return _request("PATCH", "/profile", updates)


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
def list_muscle_groups() -> list[str]:
    """List available exercise muscle groups."""
    return _request("GET", "/exercises/muscle-groups")


@mcp.tool()
def get_session(session_id: int) -> dict[str, Any]:
    """Get a workout session with planned exercises and logged sets."""
    return _request("GET", f"/sessions/{int(session_id)}")


@mcp.tool()
def get_today_session() -> dict[str, Any]:
    """Get today's latest workout session."""
    return _request("GET", "/sessions/today")


@mcp.tool()
def get_active_session() -> dict[str, Any]:
    """Get latest non-completed session plus derived current exercise/set state."""
    return _request("GET", "/sessions/active")


@mcp.tool()
def get_current_state(session_id: int) -> dict[str, Any]:
    """Get derived current planned exercise and next set for a session."""
    return _request("GET", f"/sessions/{int(session_id)}/current")


@mcp.tool()
def complete_exercise(session_id: int, planned_exercise_id: int) -> dict[str, Any]:
    """Mark the current/selected planned exercise as completed."""
    return _request("POST", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/complete")


@mcp.tool()
def create_plan(energy: int = 5, time_available: int = 45, discomfort: str = "", focus: int = 5, recent_sessions: str = "") -> dict[str, Any]:
    """Create a workout plan. Returns the stored session with share token and exercises."""
    return _request("POST", "/coach/plan", {
        "energy": int(energy),
        "time_available": int(time_available),
        "discomfort": discomfort,
        "focus": int(focus),
        "recent_sessions": recent_sessions,
    })


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
def update_planned_exercise(session_id: int, planned_exercise_id: int, status: str = "completed", new_exercise_id: int | None = None, notes: str = "") -> dict[str, Any]:
    """Mark an exercise completed/skipped/changed; optionally replace it with another catalog exercise."""
    payload: dict[str, Any] = {"status": status, "notes": notes}
    if new_exercise_id is not None:
        payload["new_exercise_id"] = int(new_exercise_id)
    return _request("PUT", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}", payload)


@mcp.tool()
def alternatives(muscle: str, limit: int = 4) -> list[dict[str, Any]]:
    """Return simple same-muscle alternatives."""
    qs = urllib.parse.urlencode({"muscle": muscle, "limit": max(1, min(int(limit), 8))})
    return _request("GET", f"/coach/alternatives?{qs}")


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
def session_web_url(session_id: int, planned_exercise_id: int | None = None) -> str:
    """Return a Mini App URL for a session or a specific exercise screen."""
    if planned_exercise_id is None:
        return f"{APP_BASE}/?session_id={int(session_id)}"
    return f"{APP_BASE}/?session_id={int(session_id)}&exercise_id={int(planned_exercise_id)}"


@mcp.tool()
def share_web_url(share_token: str) -> str:
    """Return a read-only share URL for a companion."""
    token = urllib.parse.quote(str(share_token), safe="")
    return f"{APP_BASE}/?share_token={token}"


if __name__ == "__main__":
    mcp.run()
