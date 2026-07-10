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
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

API_BASE = os.getenv("GYM_TRACKER_API_BASE", "http://localhost:8000/api").rstrip("/")
APP_BASE = os.getenv("GYM_TRACKER_APP_BASE", "http://localhost:8000").rstrip("/")
COACH_KEY = os.getenv("GYM_TRACKER_COACH_KEY", "")

COACH_GUIDE = """You are the athlete's personal trainer. This app has no AI: it only stores
profile, exercise catalog, sessions and sets. You are the brain; Telegram chat is the main
product and the Mini App (deep links) is the visual surface.

Operating rules:
1. Onboarding first: get_athlete_profile. If onboarding_complete is false, don't plan yet —
   ask like a real trainer (goal, experience, days/time, injuries, equipment, likes) in short
   blocks and save with patch_athlete_profile (finish with {"onboarding_complete": true}).
2. Never invent weight, height, injuries, machines or history. Read the profile, check
   list_sessions / exercise_progress / list_measurements, or ask.
3. Pick exercises yourself: call list_exercise_facets for valid filters, use list_exercises,
   then send returned exercise ids in create_plan exercises_json. Never invent catalog ids.
4. Preview before training: create_plan leaves the session as 'planned'; send session_web_url.
   Not convincing? delete_session and create another.
5. During the workout update state, don't just chat: "did 12 reps" → log_set; pain →
   alternative + patch_athlete_profile; machine busy → update_planned_exercise with
   new_exercise_id. Current position: get_active_session / get_current_state.
6. When done: finish_session with feedback (let the backend measure duration from
   started_at — do not send duration_actual unless the athlete states it). Use it
   and list_sessions to adapt the next plan.
7. Body data (weight, composition, scans): record_body_measurement, never overwrite notes.
8. Sharing: share_web_url(share_token) gives a read-only link for a companion.
9. Multi-user: always pass telegram_user_id (Telegram id of the chat) on profile/session tools.

Persistence split: physical/trainable facts → app profile. Your own agent memory → only
stable human preferences. Never duplicate workout logs outside the app."""

mcp = FastMCP("gym-tracker", instructions=COACH_GUIDE)


@mcp.custom_route("/health", methods=["GET"])
async def health_check(_: Request) -> JSONResponse:
    """Liveness endpoint for Docker, Coolify, and reverse proxies."""
    return JSONResponse({"status": "ok", "service": "gym-tracker-mcp"})


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
def list_exercises(
    search: str = "",
    muscle_group: str = "",
    body_part: str = "",
    equipment: str = "",
    limit: int = 10,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Search exercises by name and exact catalog facets.

    Call list_exercise_facets first instead of guessing muscle_group, body_part,
    or equipment. Use offset to inspect more than the first page.
    """
    params: dict[str, Any] = {
        "limit": max(1, min(int(limit), 50)),
        "offset": max(0, int(offset)),
    }
    if search:
        params["search"] = search
    if muscle_group:
        params["muscle_group"] = muscle_group
    if body_part:
        params["body_part"] = body_part
    if equipment:
        params["equipment"] = equipment
    qs = urllib.parse.urlencode(params)
    return _request("GET", f"/exercises?{qs}")


@mcp.tool()
def get_exercise(exercise_id: int) -> dict[str, Any]:
    """Get full detail of one catalog exercise: instructions, muscles, equipment, image."""
    return _request("GET", f"/exercises/{int(exercise_id)}")


@mcp.tool()
def list_exercise_facets() -> dict[str, list[str]]:
    """List valid muscle_group, body_part, and equipment values for catalog search."""
    return _request("GET", "/exercises/facets")


@mcp.tool()
def exercise_progress(exercise_id: int, limit: int = 20, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """Progression by session: session_id, date, top_weight, top_reps, volume, and sets. Bodyweight exercises use top_reps. Use session_id to open a past session with session_web_url."""
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 100))})
    return _request("GET", f"/exercises/{int(exercise_id)}/progress?{qs}", user_id=telegram_user_id)


@mcp.tool()
def get_session(session_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get a workout session with planned exercises and logged sets.

    Pass telegram_user_id on multi-user instances so the API can scope ownership.
    """
    return _request("GET", f"/sessions/{int(session_id)}", user_id=telegram_user_id)


@mcp.tool()
def list_sessions(limit: int = 10, on_date: str = "", telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """List recent workout sessions (summary: date, title, status, sets).

    Use it to adapt new plans to recent training. For today's session pass
    on_date as an ISO date (YYYY-MM-DD).
    """
    params: dict[str, Any] = {"limit": max(1, min(int(limit), 50))}
    if on_date:
        params["on_date"] = on_date
    qs = urllib.parse.urlencode(params)
    return _request("GET", f"/sessions?{qs}", user_id=telegram_user_id)


@mcp.tool()
def get_active_session(telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get latest non-completed session plus derived current exercise/set state."""
    return _request("GET", "/sessions/active", user_id=telegram_user_id)


@mcp.tool()
def get_current_state(session_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get derived current planned exercise and next set for a session."""
    return _request("GET", f"/sessions/{int(session_id)}/current", user_id=telegram_user_id)


@mcp.tool()
def complete_exercise(session_id: int, planned_exercise_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Mark the current/selected planned exercise as completed."""
    return _request("POST", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/complete", user_id=telegram_user_id)


@mcp.tool()
def delete_session(session_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Delete a workout session. Use to discard a plan preview the athlete rejected before creating a new one."""
    return _request("DELETE", f"/sessions/{int(session_id)}", user_id=telegram_user_id)


@mcp.tool()
def create_plan(title: str = "", goal: str = "", energy: int = 5, time_available: int = 45, discomfort: str = "", exercises_json: str = "", telegram_user_id: int | None = None) -> dict[str, Any]:
    """Create a workout plan owned by the Telegram athlete.

    title: workout name only (e.g. "Pecho + Tríceps"). Never embed the date —
    the app stores and displays session_date separately.

    CRITICAL: telegram_user_id is required. Without it the API would create an
    unscoped session that share links can open, but the Telegram Mini App cannot
    show as the athlete's active session.

    exercises_json: JSON array of the exercises you picked from list_exercises, e.g.
    [{"exercise_id": 12, "order": 0, "target_sets": 3, "target_reps": 10,
      "suggested_weight": 40.0, "notes": "controla la bajada"}]
    Required: pick the exercises yourself from list_exercises; the API rejects empty plans.
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
def log_set(session_id: int, planned_exercise_id: int, set_number: int, reps: int, weight: float = 0.0, rpe: float | None = None, sensation: str = "", notes: str = "", telegram_user_id: int | None = None) -> dict[str, Any]:
    """Log one performed set. reps must be positive; weight is zero for bodyweight."""
    payload: dict[str, Any] = {
        "set_number": int(set_number),
        "weight": float(weight),
        "reps": int(reps),
        "sensation": sensation,
        "notes": notes,
    }
    if rpe is not None:
        payload["rpe"] = float(rpe)
    return _request("POST", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets", payload, user_id=telegram_user_id)


@mcp.tool()
def delete_set(session_id: int, planned_exercise_id: int, set_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Delete a wrongly logged set (the athlete corrected themselves). Set ids come in session responses."""
    return _request("DELETE", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets/{int(set_id)}", user_id=telegram_user_id)


@mcp.tool()
def update_planned_exercise(session_id: int, planned_exercise_id: int, status: Literal["pending", "in_progress", "completed", "skipped", "changed"] = "completed", new_exercise_id: int | None = None, notes: str = "", telegram_user_id: int | None = None) -> dict[str, Any]:
    """Mark an exercise completed/skipped/changed; optionally replace it with another catalog exercise."""
    payload: dict[str, Any] = {"status": status, "notes": notes}
    if new_exercise_id is not None:
        payload["new_exercise_id"] = int(new_exercise_id)
    return _request("PUT", f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}", payload, user_id=telegram_user_id)


@mcp.tool()
def finish_session(session_id: int, feedback: str = "", energy: int = 5, discomfort: str = "", duration_actual: int | None = None, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Finish a workout session and store final feedback.

    Leave duration_actual empty (recommended) — the backend measures it from
    started_at. Send a value only when the athlete explicitly states how long
    it took; sending 0 records a 0-minute session.
    """
    payload: dict[str, Any] = {
        "feedback": feedback,
        "energy": int(energy),
        "discomfort": discomfort,
    }
    if duration_actual is not None:
        payload["duration_actual"] = int(duration_actual)
    return _request("POST", f"/sessions/{int(session_id)}/finish", payload, user_id=telegram_user_id)


@mcp.tool()
def list_measurements(limit: int = 20, telegram_user_id: int | None = None) -> list[dict[str, Any]]:
    """List historical body measurements: weight, muscle, fat, score, source and date.

    Use this instead of profile.weight_kg when talking about evolution over time.
    """
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 100))})
    return _request("GET", f"/profile/measurements?{qs}", user_id=telegram_user_id)


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

    Use when the athlete sends weight, body-composition, medical measurement,
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
def session_web_url(session_id: int, planned_exercise_id: int | None = None, telegram_user_id: int | None = None) -> str:
    """Return a Mini App URL for a session or a specific exercise screen.

    User-facing links must not expose sequential session ids. Resolve the
    session through the API using the coach key, then build a share-token URL.
    """
    session = _request("GET", f"/sessions/{int(session_id)}", user_id=telegram_user_id)
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
