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

from fastmcp import FastMCP
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
1. Start each coaching turn with training_snapshot. If onboarding_complete is false, don't plan yet —
   ask like a real trainer (goal, experience, days/time and preferences) in short
   blocks and save with patch_athlete_profile (finish with {"onboarding_complete": true}).
2. Check muscle readiness: training_snapshot includes active_fatigue and muscle_recovery (36h decay).
   Never schedule high-volume work for fatigued muscle groups unless doing an intentional overload block.
3. Progressive Overload: use get_progression_recommendation to get mathematically sound weight/rep jumps
   (linear, Greyskull LP double jumps, rep ranges, or deloads) based on exact historical performance.
4. Never invent weight, height, preferences or history. Read the profile, check
   list_sessions / exercise_progress / list_measurements, or ask.
5. Pick exercises yourself: call list_exercise_facets for valid filters, use list_exercises,
   then send returned exercise ids in create_plan exercises. Never invent catalog ids.
6. Preview before training: create_plan leaves the session as 'planned'; send session_web_url.
   Not convincing? delete_session and create another.
7. During the workout update state: "did 12 reps @ 80kg (2 RIR)" → log_set; pain →
   alternative + session feedback; machine busy → update_planned_exercise with
   new_exercise_id. Ramp-up sets should be marked with is_warmup=True.
8. When done: finish_session with feedback (let the backend measure duration from
   started_at — do not send duration_actual unless the athlete states it).
9. Body data: record_body_measurement, never overwrite notes.
10. Migrating history: use import_tracker_csv when the athlete sends a Hevy, Strong, or FitNotes CSV export.
11. Multi-user: always pass telegram_user_id (Telegram id of the chat) on profile/session tools."""

mcp = FastMCP("gym-tracker", instructions=COACH_GUIDE)


@mcp.custom_route("/health", methods=["GET"])
async def health_check(_: Request) -> JSONResponse:
    """Liveness endpoint for Docker, Coolify, and reverse proxies."""
    return JSONResponse({"status": "ok", "service": "gym-tracker-mcp"})


@mcp.custom_route("/ready", methods=["GET"])
async def readiness_check(_: Request) -> JSONResponse:
    """Readiness means the API dependency can serve a request too."""
    try:
        _request("GET", "/ready")
    except RuntimeError as error:
        return JSONResponse(
            {"status": "not ready", "detail": str(error)}, status_code=503
        )
    return JSONResponse({"status": "ready", "service": "gym-tracker-mcp"})


def _require_telegram_user_id(telegram_user_id: int | None, tool_name: str) -> int:
    """Fail before any HTTP call when a correction would be unscoped."""
    if telegram_user_id is None:
        raise ValueError(
            f"telegram_user_id is required on {tool_name} to scope mutations and reads to the current athlete"
        )
    return int(telegram_user_id)


def _require_one_metric(
    payload: dict[str, Any],
    reps_key: str = "reps",
    duration_key: str = "duration_minutes",
    weight_key: str = "weight",
) -> None:
    if (payload.get(reps_key) is None) == (payload.get(duration_key) is None):
        raise ValueError(f"exactly one of {reps_key} or {duration_key} is required")
    if payload.get(duration_key) is not None and payload.get(weight_key) is not None:
        raise ValueError(f"{duration_key} does not accept {weight_key}")


def _request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    user_id: int | None = None,
    raw_body: str | bytes | None = None,
    content_type: str | None = None,
) -> Any:
    """Send an HTTP request to the gym-tracker API and return parsed JSON.

    Raises RuntimeError with the API error detail on non-2xx responses.
    """
    url = f"{API_BASE}{path}"
    data = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "gym-tracker-mcp/1.0 (+https://gym.jordixlab.com)",
    }
    if COACH_KEY:
        headers["X-Coach-Key"] = COACH_KEY
        if user_id is None:
            raise ValueError(
                "telegram_user_id is required when COACH_KEY is set; "
                "pass the athlete id from the current chat."
            )
    if user_id is not None:
        headers["X-Telegram-User-Id"] = str(user_id)
    if raw_body is not None:
        data = raw_body.encode("utf-8") if isinstance(raw_body, str) else raw_body
        headers["Content-Type"] = content_type or "text/plain; charset=utf-8"
    elif payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = content_type or "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {"ok": True}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"API {method} {path} → HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Network error calling {method} {path}: {exc.reason}"
        ) from exc


@mcp.tool()
def health() -> dict[str, Any]:
    """Check if the gym-tracker API is online and healthy."""
    return _request("GET", "/health")


@mcp.tool()
def get_athlete_profile(telegram_user_id: int | None = None) -> dict[str, Any]:
    """Read the athlete's profile: goals, body metrics, preferences and onboarding status.

    Always call this before creating a plan. If onboarding_complete is false,
    start the onboarding conversation first.
    telegram_user_id: Telegram id of the athlete you are talking to. Omit only on single-user instances.
    """
    return _request("GET", "/profile", user_id=telegram_user_id)


@mcp.tool()
def patch_athlete_profile(
    updates: dict[str, Any], telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Update profile facts with a native MCP object, never a JSON-encoded string."""
    return _request("PATCH", "/profile", updates, user_id=telegram_user_id)


@mcp.tool()
def list_exercises(
    search: str = "",
    muscle_group: str = "",
    body_part: str = "",
    equipment: str = "",
    activity_type: str = "",
    exclude_disliked: bool = False,
    limit: int = 10,
    offset: int = 0,
    telegram_user_id: int | None = None,
) -> list[dict[str, Any]]:
    """Search exercises by name and exact catalog facets.

    Call list_exercise_facets first instead of guessing muscle_group, body_part,
    equipment, or activity_type. Use offset to inspect more than the first page.
    Pass exclude_disliked=true to filter out the athlete's disliked exercises.
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
    if activity_type:
        params["activity_type"] = activity_type
    if exclude_disliked:
        params["exclude_disliked"] = "true"
    qs = urllib.parse.urlencode(params)
    return _request("GET", f"/exercises?{qs}", user_id=telegram_user_id)


@mcp.tool()
def get_exercise(exercise_id: int) -> dict[str, Any]:
    """Get full detail of one catalog exercise: instructions, muscles, equipment, image."""
    return _request("GET", f"/exercises/{int(exercise_id)}")


@mcp.tool()
def list_exercise_facets() -> dict[str, list[str]]:
    """List valid muscle_group, body_part, equipment, and activity_type values."""
    return _request("GET", "/exercises/facets")


@mcp.tool()
def exercise_progress(
    exercise_id: int, limit: int = 20, telegram_user_id: int | None = None
) -> list[dict[str, Any]]:
    """Progression by session. Strength reports weight/reps; cardio reports top_duration_minutes. Use session_id to open a past session."""
    qs = urllib.parse.urlencode({"limit": max(1, min(int(limit), 100))})
    return _request(
        "GET", f"/exercises/{int(exercise_id)}/progress?{qs}", user_id=telegram_user_id
    )


@mcp.tool()
def get_session(session_id: int, telegram_user_id: int | None = None) -> dict[str, Any]:
    """Get a workout session with planned exercises and logged sets.

    Pass telegram_user_id on multi-user instances so the API can scope ownership.
    """
    return _request("GET", f"/sessions/{int(session_id)}", user_id=telegram_user_id)


@mcp.tool()
def list_sessions(
    limit: int = 10, on_date: str = "", telegram_user_id: int | None = None
) -> list[dict[str, Any]]:
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
def get_current_state(
    session_id: int, telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Get derived current planned exercise and next set for a session."""
    return _request(
        "GET", f"/sessions/{int(session_id)}/current", user_id=telegram_user_id
    )


@mcp.tool()
def complete_exercise(
    session_id: int, planned_exercise_id: int, telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Mark the current/selected planned exercise as completed."""
    return _request(
        "POST",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/complete",
        user_id=telegram_user_id,
    )


@mcp.tool()
def update_session(
    updates: dict[str, Any], session_id: int, telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Update session metadata with a native MCP object, never a JSON-encoded string.

    Accepted keys (pass only what changes):
      session_date: ISO date (YYYY-MM-DD), e.g. when the athlete says the workout
        actually happened yesterday.
      title: workout name only, never embed the date.
      goal, feedback, coach_summary, discomfort: free text.
      energy: 1-10. duration_actual: minutes.
    """
    return _request(
        "PATCH", f"/sessions/{int(session_id)}", updates, user_id=telegram_user_id
    )


@mcp.tool()
def delete_session(
    session_id: int, telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Delete a workout session. Use to discard a plan preview the athlete rejected before creating a new one."""
    return _request("DELETE", f"/sessions/{int(session_id)}", user_id=telegram_user_id)


@mcp.tool()
def create_plan(
    title: str = "",
    goal: str = "",
    energy: int = 5,
    time_available: int = 45,
    discomfort: str = "",
    exercises: list[dict[str, Any]] | None = None,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Create a workout plan owned by the Telegram athlete.

    title: workout name only (e.g. "Pecho + Tríceps"). Never embed the date —
    the app stores and displays session_date separately.

    CRITICAL: telegram_user_id is required. Without it the API would create an
    unscoped session that share links can open, but the Telegram Mini App cannot
    show as the athlete's active session.

    exercises: native MCP array of the exercises you picked from list_exercises, e.g.
    [{"exercise_id": 12, "order": 0, "target_sets": 3, "target_reps": 10,
      "suggested_weight": 40.0, "unilateral": false, "notes": "controla la bajada"}]
    Cardio uses target_duration_minutes instead of target_reps/suggested_weight:
    [{"exercise_id": 99, "order": 1, "target_sets": 1,
      "target_duration_minutes": 20, "unilateral": false}]
    Optional per-set targets (ramping/variable sets):
    [{"exercise_id": 12, "order": 0, "target_sets": 3, "target_reps": 10,
      "suggested_weight": 40.0,
      "set_targets": [{"set_number": 1, "weight": 40, "reps": 12},
                      {"set_number": 2, "weight": 45, "reps": 10},
                      {"set_number": 3, "weight": 50, "reps": 8}]}]
                      Cardio uses target_duration_minutes and duration_minutes in set_targets;
                      it never uses target_reps, reps, or weight.
    Required: pick the exercises yourself from list_exercises; the API rejects empty plans.
    Always give suggested_weight for loaded strength exercises, based on the
    athlete's history; omit it for bodyweight and cardio exercises.
    """
    if telegram_user_id is None:
        raise ValueError(
            "telegram_user_id is required for create_plan so the Mini App can show "
            "the workout as the athlete's active session. Pass the Telegram user id "
            "from the current chat/context."
        )
    exercises = exercises or []
    for exercise in exercises:
        _require_one_metric(
            exercise,
            "target_reps",
            "target_duration_minutes",
            "suggested_weight",
        )
        if exercise.get("target_duration_minutes") is not None and exercise.get(
            "unilateral"
        ):
            raise ValueError(
                "cardio target_duration_minutes does not accept unilateral"
            )
        for target in exercise.get("set_targets") or []:
            _require_one_metric(target)
    return _request(
        "POST",
        "/coach/plan",
        {
            "title": title,
            "goal": goal,
            "energy": int(energy),
            "time_available": int(time_available),
            "discomfort": discomfort,
            "exercises": exercises,
        },
        user_id=telegram_user_id,
    )


@mcp.tool()
def import_completed_session(
    session_date: str,
    exercises: list[dict[str, Any]],
    title: str = "",
    feedback: str = "",
    duration_actual: int = 0,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Import one already-performed historical workout in a single call.

    Use when the athlete migrates history from another tracker or dictates a
    past workout. Creates the session directly as 'completed' on session_date
    (ISO YYYY-MM-DD) with all exercises and sets — no need to create_plan,
    log_set or finish_session. One call per historical session.

    Resolve exercise ids first with list_exercises / list_exercise_facets;
    never invent catalog ids. exercises is a native MCP array:
    [{"exercise_id": 12, "order": 0, "notes": "",
      "sets": [{"weight": 40.0, "reps": 10, "rpe": 8.0}, {"weight": 40.0, "reps": 8}]}]
    Bodyweight and band exercises omit weight; weighted strength uses kg > 0.
    Cardio sets use duration_minutes and omit reps and weight.
    telegram_user_id is required so the session belongs to the athlete.
    """
    if telegram_user_id is None:
        raise ValueError(
            "telegram_user_id is required so the imported session belongs to the athlete."
        )
    for exercise in exercises:
        for performed_set in exercise.get("sets") or []:
            _require_one_metric(performed_set)
    return _request(
        "POST",
        "/coach/import",
        {
            "session_date": session_date,
            "title": title,
            "feedback": feedback,
            "duration_actual": int(duration_actual),
            "exercises": exercises,
        },
        user_id=telegram_user_id,
    )


def format_compact_set(performed_set: dict[str, Any]) -> str:
    """Format a single performed set into compact high-density notation.

    Examples:
      - 10 reps @ 80kg (2 RIR) -> "10@80kg (2RIR)"
      - Warm-up 12 reps @ 50kg -> "W:12@50kg"
      - Bodyweight 15 reps -> "15@BW"
      - Timed cardio/isometric 25 min -> "25m"
      - Weighted with RPE -> "10@80kg (@8RPE)"
    """
    if not isinstance(performed_set, dict):
        return str(performed_set)

    is_warmup = bool(performed_set.get("is_warmup", False))
    prefix = "W:" if is_warmup else ""

    reps = performed_set.get("reps")
    duration = performed_set.get("duration_minutes")
    weight = performed_set.get("weight")
    rir = performed_set.get("rir")
    rpe = performed_set.get("rpe")

    if reps is not None:
        if weight is not None and float(weight) > 0:
            w = float(weight)
            w_str = f"{int(w)}" if w.is_integer() else f"{w}"
            core = f"{prefix}{reps}@{w_str}kg"
        else:
            core = f"{prefix}{reps}@BW" if not prefix else f"{prefix}{reps} reps"
    elif duration is not None:
        core = f"{prefix}{duration}m"
    else:
        core = f"{prefix}0 reps"

    tag = ""
    if not is_warmup:
        if rir is not None:
            r = float(rir)
            r_str = f"{int(r)}" if r.is_integer() else f"{r}"
            tag = f" ({r_str}RIR)"
        elif rpe is not None:
            r = float(rpe)
            r_str = f"{int(r)}" if r.is_integer() else f"{r}"
            tag = f" (@{r_str}RPE)"

    return f"{core}{tag}"


def format_target_notation(planned_exercise: dict[str, Any]) -> str:
    """Format target sets/reps/weight or duration into compact string notation.

    Examples:
      - 3 sets of 10 reps @ 80kg -> "3x10@80kg"
      - 3 sets of 10 reps bodyweight -> "3x10@BW"
      - 1 set of 20 min -> "1x20m"
    """
    if not isinstance(planned_exercise, dict):
        return ""
    target_sets = planned_exercise.get("target_sets", 3)
    target_reps = planned_exercise.get("target_reps")
    target_dur = planned_exercise.get("target_duration_minutes")
    suggested_weight = planned_exercise.get("suggested_weight")

    if target_reps is not None:
        if suggested_weight is not None and float(suggested_weight) > 0:
            w = float(suggested_weight)
            w_str = f"{int(w)}" if w.is_integer() else f"{w}"
            return f"{target_sets}x{target_reps}@{w_str}kg"
        return f"{target_sets}x{target_reps}@BW"
    if target_dur is not None:
        return f"{target_sets}x{target_dur}m"
    return f"{target_sets} sets"


def _extract_active_fatigue(
    muscle_recovery_data: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Extract dense active fatigue info for muscles not fully recovered.

    Filters out resting unworked muscles with zero fatigue so LLM context isn't polluted
    with 20+ identical 100% readiness objects.
    """
    if not isinstance(muscle_recovery_data, dict):
        return []

    raw_muscles = muscle_recovery_data.get("muscles") or {}
    active_fatigue: list[dict[str, Any]] = []

    if isinstance(raw_muscles, dict):
        for muscle_name, info in raw_muscles.items():
            if not isinstance(info, dict):
                continue
            status = info.get("status")
            readiness_pct = info.get("readiness_pct", 100)
            hours_ago = info.get("hours_since_trained")

            if (
                status in ("fatigued", "recovering")
                or readiness_pct < 100
                or hours_ago is not None
            ):
                item: dict[str, Any] = {
                    "muscle": info.get("muscle") or muscle_name,
                    "status": status
                    or (
                        "fatigued"
                        if readiness_pct < 45
                        else ("recovering" if readiness_pct < 75 else "ready")
                    ),
                    "readiness_pct": readiness_pct,
                }
                if hours_ago is not None:
                    item["hours_since_trained"] = round(float(hours_ago), 1)
                active_fatigue.append(item)

    active_fatigue.sort(key=lambda x: x.get("readiness_pct", 100))
    return active_fatigue


def format_dense_snapshot(raw_snapshot: dict[str, Any]) -> dict[str, Any]:
    """Transform raw snapshot into dense, high-signal JSON for Telegram AI coach."""
    if not isinstance(raw_snapshot, dict):
        return raw_snapshot

    # 1. Compact Profile
    raw_profile = raw_snapshot.get("profile") or {}
    compact_profile: dict[str, Any] = {}
    if isinstance(raw_profile, dict):
        for k in (
            "name",
            "age",
            "height_cm",
            "weight_kg",
            "goal",
            "experience_level",
            "notes",
            "preferred_exercises",
            "onboarding_complete",
            "telegram_user_id",
        ):
            val = raw_profile.get(k)
            if val is not None and val != "":
                compact_profile[k] = val

    # 2. Recovery & Active Fatigue
    active_fatigue = _extract_active_fatigue(raw_snapshot.get("muscle_recovery"))

    # 3. Active Session
    raw_active = raw_snapshot.get("active_session")
    compact_active = None
    if isinstance(raw_active, dict) and raw_active:
        raw_sess = raw_active.get("session")
        session_obj: dict[str, Any] = (
            raw_sess if isinstance(raw_sess, dict) else raw_active
        )
        raw_curr = raw_active.get("current")
        current_obj: dict[str, Any] = (
            raw_curr if isinstance(raw_curr, dict) else {}
        )

        exercises_raw = (
            session_obj.get("planned_exercises")
            or session_obj.get("exercises")
            or []
        )
        formatted_planned = []
        for pe in sorted(exercises_raw, key=lambda x: x.get("order", 0)):
            pe_name = pe.get("name") or (
                pe.get("exercise", {}).get("name")
                if isinstance(pe.get("exercise"), dict)
                else ""
            )
            performed = pe.get("performed_sets") or []
            pe_dict: dict[str, Any] = {
                "id": pe.get("id"),
                "exercise_id": pe.get("exercise_id"),
                "name": pe_name,
                "target": format_target_notation(pe),
                "status": pe.get("status", "planned"),
                "sets": [format_compact_set(s) for s in performed],
            }
            formatted_planned.append(pe_dict)

        compact_active = {
            "id": session_obj.get("id"),
            "title": session_obj.get("title") or "Workout",
            "status": session_obj.get("status"),
            "session_date": session_obj.get("session_date"),
            "exercises_done": current_obj.get("exercises_completed", 0),
            "exercises_total": current_obj.get(
                "total_exercises", len(formatted_planned)
            ),
            "current_exercise": current_obj.get("current_exercise_name")
            or (formatted_planned[0]["name"] if formatted_planned else None),
            "current_set": current_obj.get("current_set_number", 1),
            "next_target": format_target_notation(current_obj)
            if current_obj
            else None,
            "next_action": current_obj.get("next_action"),
            "exercises": formatted_planned,
        }

    # 4. Recent History
    raw_recent = raw_snapshot.get("recent_sessions") or []
    formatted_recent = []
    for sess in raw_recent:
        sess_date = sess.get("session_date")
        title = sess.get("title") or "Workout"
        ex_list = sess.get("exercises") or sess.get("planned_exercises") or []
        sets_summary = []
        for ex in sorted(ex_list, key=lambda x: x.get("order", 0)):
            ex_name = ex.get("name") or (
                ex.get("exercise", {}).get("name")
                if isinstance(ex.get("exercise"), dict)
                else f"Ex {ex.get('exercise_id')}"
            )
            performed = ex.get("performed_sets") or []
            if performed:
                set_strs = [format_compact_set(s) for s in performed]
                sets_summary.append(f"{ex_name}: [{', '.join(set_strs)}]")
            else:
                target_str = format_target_notation(ex)
                sets_summary.append(f"{ex_name}: {target_str}")

        sess_entry: dict[str, Any] = {
            "id": sess.get("id"),
            "session_date": sess_date,
            "title": title,
            "status": sess.get("status"),
            "sets": sets_summary,
        }
        if sess.get("energy") is not None:
            sess_entry["energy"] = sess.get("energy")
        if sess.get("duration_actual") is not None:
            sess_entry["duration_actual"] = sess.get("duration_actual")
        formatted_recent.append(sess_entry)

    # 5. Recent Measurements
    raw_measurements = raw_snapshot.get("recent_measurements") or []
    formatted_measurements = []
    for m in raw_measurements:
        if isinstance(m, dict):
            compact_m = {
                k: v
                for k, v in m.items()
                if v is not None and v != "" and k not in ("id", "telegram_user_id")
            }
            formatted_measurements.append(compact_m)

    return {
        "profile": compact_profile,
        "active_session": compact_active,
        "active_fatigue": active_fatigue,
        "muscle_recovery": raw_snapshot.get("muscle_recovery"),
        "recent_sessions": formatted_recent,
        "recent_measurements": formatted_measurements,
    }


@mcp.tool()
def training_snapshot(
    telegram_user_id: int, session_limit: int = 5
) -> dict[str, Any]:
    """Read dense, high-signal athlete context for one coach turn.

    Includes profile, active workout state, active muscle fatigue / recovery readiness,
    and recent session history with compact set notation.
    """
    user_id = _require_telegram_user_id(telegram_user_id, "training_snapshot")
    qs = urllib.parse.urlencode({"limit": max(1, min(int(session_limit), 10))})
    raw = _request("GET", f"/coach/snapshot?{qs}", user_id=user_id)
    return format_dense_snapshot(raw)
    user_id = _require_telegram_user_id(telegram_user_id, "training_snapshot")
    qs = urllib.parse.urlencode({"limit": max(1, min(int(session_limit), 10))})
    raw = _request("GET", f"/coach/snapshot?{qs}", user_id=user_id)
    return format_dense_snapshot(raw)


@mcp.tool()
def log_set(
    session_id: int,
    planned_exercise_id: int,
    set_number: int,
    reps: int | None = None,
    duration_minutes: int | None = None,
    weight: float | None = None,
    is_warmup: bool = False,
    rpe: float | None = None,
    rir: float | None = None,
    sensation: str = "",
    notes: str = "",
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Log one performed set.

    Strength requires reps and optional kg. Cardio requires duration_minutes and
    rejects reps/weight. Exactly one execution metric must be supplied.
    Set is_warmup=True for ramp-up / warm-up sets (excluded from PRs/progression).
    rir: Reps In Reserve (0 = failure, 1 = 1 rep left, 2 = 2 reps left).
    """
    payload: dict[str, Any] = {
        "set_number": int(set_number),
        "is_warmup": bool(is_warmup),
        "sensation": sensation,
        "notes": notes,
    }
    if reps is not None:
        payload["reps"] = int(reps)
    if duration_minutes is not None:
        payload["duration_minutes"] = int(duration_minutes)
    if weight is not None:
        payload["weight"] = float(weight)
    _require_one_metric(payload)
    if rpe is not None:
        payload["rpe"] = float(rpe)
    if rir is not None:
        payload["rir"] = float(rir)
    return _request(
        "POST",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets",
        payload,
        user_id=telegram_user_id,
    )


@mcp.tool()
def delete_set(
    session_id: int,
    planned_exercise_id: int,
    set_id: int,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Delete a wrongly logged set (the athlete corrected themselves). Set ids come in session responses."""
    return _request(
        "DELETE",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets/{int(set_id)}",
        user_id=telegram_user_id,
    )


@mcp.tool()
def restore_set(
    session_id: int,
    planned_exercise_id: int,
    set_number: int,
    reps: int | None = None,
    duration_minutes: int | None = None,
    weight: float | None = None,
    is_warmup: bool = False,
    rpe: float | None = None,
    rir: float | None = None,
    sensation: str = "",
    notes: str = "",
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Restore one deleted set at its original number, including a middle set.

    telegram_user_id is required so the correction stays scoped to its athlete.
    """
    user_id = _require_telegram_user_id(telegram_user_id, "restore_set")
    payload: dict[str, Any] = {
        "set_number": int(set_number),
        "is_warmup": bool(is_warmup),
        "sensation": sensation,
        "notes": notes,
    }
    if reps is not None:
        payload["reps"] = int(reps)
    if duration_minutes is not None:
        payload["duration_minutes"] = int(duration_minutes)
    if weight is not None:
        payload["weight"] = float(weight)
    _require_one_metric(payload)
    if rpe is not None:
        payload["rpe"] = float(rpe)
    if rir is not None:
        payload["rir"] = float(rir)
    return _request(
        "POST",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/sets/restore",
        payload,
        user_id=user_id,
    )


@mcp.tool()
def delete_planned_exercise(
    session_id: int, planned_exercise_id: int, telegram_user_id: int | None = None
) -> dict[str, Any]:
    """Remove a planned exercise from a session completely. Only works when no sets have been logged for it."""
    return _request(
        "DELETE",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}",
        user_id=telegram_user_id,
    )


@mcp.tool()
def add_planned_exercise(
    session_id: int,
    exercise_id: int,
    order: int | None = None,
    target_sets: int = 3,
    target_reps: int | None = None,
    target_duration_minutes: int | None = None,
    suggested_weight: float | None = None,
    unilateral: bool = False,
    set_targets: list[dict[str, Any]] | None = None,
    notes: str = "",
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Add a catalog exercise to an existing planned or in-progress session.

    Omit order to append at the end. Pass order to insert at a specific position
    (existing exercises at that position or later shift down).
    set_targets: per-set metric overrides. Strength uses weight/reps; cardio uses
    duration_minutes and no weight/reps. Always give suggested_weight for loaded
    strength exercises; omit it for bodyweight and cardio exercises.
    """
    payload: dict[str, Any] = {
        "exercise_id": int(exercise_id),
        "target_sets": int(target_sets),
        "notes": notes,
    }
    if target_reps is not None:
        payload["target_reps"] = int(target_reps)
    if target_duration_minutes is not None:
        payload["target_duration_minutes"] = int(target_duration_minutes)
    if suggested_weight is not None:
        payload["suggested_weight"] = float(suggested_weight)
    _require_one_metric(
        payload,
        "target_reps",
        "target_duration_minutes",
        "suggested_weight",
    )
    if target_duration_minutes is not None and unilateral:
        raise ValueError("cardio target_duration_minutes does not accept unilateral")
    payload["unilateral"] = bool(unilateral)
    if order is not None:
        payload["order"] = int(order)
    if set_targets is not None:
        for target in set_targets:
            _require_one_metric(target)
        payload["set_targets"] = set_targets
    return _request(
        "POST",
        f"/sessions/{int(session_id)}/exercises",
        payload,
        user_id=telegram_user_id,
    )


@mcp.tool()
def update_planned_exercise(
    session_id: int,
    planned_exercise_id: int,
    status: Literal["pending", "in_progress", "completed", "skipped"] | None = None,
    new_exercise_id: int | None = None,
    target_sets: int | None = None,
    target_reps: int | None = None,
    target_duration_minutes: int | None = None,
    suggested_weight: float | None = None,
    notes: str | None = None,
    set_targets: list[dict[str, Any]] | None = None,
    unilateral: bool | None = None,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Update only the supplied exercise fields.

    Omit status and notes to preserve their current values. Completion and
    skipping must always be explicit.
    set_targets: per-set weight/reps overrides, e.g.
    [{"set_number": 1, "weight": 40, "reps": 12},
     {"set_number": 2, "weight": 45, "reps": 10}]
    """
    payload: dict[str, Any] = {}
    if status is not None:
        payload["status"] = status
    if notes is not None:
        payload["notes"] = notes
    if new_exercise_id is not None:
        payload["new_exercise_id"] = int(new_exercise_id)
    if target_sets is not None:
        payload["target_sets"] = int(target_sets)
    if target_reps is not None:
        payload["target_reps"] = int(target_reps)
    if target_duration_minutes is not None:
        payload["target_duration_minutes"] = int(target_duration_minutes)
    if suggested_weight is not None:
        payload["suggested_weight"] = float(suggested_weight)
    if set_targets is not None:
        for target in set_targets:
            _require_one_metric(target)
        payload["set_targets"] = set_targets
    if unilateral is not None:
        payload["unilateral"] = bool(unilateral)
    return _request(
        "PUT",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}",
        payload,
        user_id=telegram_user_id,
    )


@mcp.tool()
def reclassify_performed_exercise(
    session_id: int,
    planned_exercise_id: int,
    new_exercise_id: int,
    reason: str = "",
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Reclassify a performed exercise after weight-compatibility validation.

    All historical sets are preserved. telegram_user_id is required for this
    athlete-scoped correction.
    """
    user_id = _require_telegram_user_id(
        telegram_user_id, "reclassify_performed_exercise"
    )
    return _request(
        "POST",
        f"/sessions/{int(session_id)}/exercises/{int(planned_exercise_id)}/reclassify",
        {"new_exercise_id": int(new_exercise_id), "reason": reason},
        user_id=user_id,
    )


@mcp.tool()
def reorder_session_exercises(
    session_id: int,
    planned_exercise_ids: list[int],
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Set the complete explicit order of a single athlete's session."""
    user_id = _require_telegram_user_id(telegram_user_id, "reorder_session_exercises")
    return _request(
        "PUT",
        f"/sessions/{int(session_id)}/exercises/reorder",
        {"planned_exercise_ids": [int(value) for value in planned_exercise_ids]},
        user_id=user_id,
    )


@mcp.tool()
def finish_session(
    session_id: int,
    feedback: str = "",
    energy: int = 5,
    discomfort: str = "",
    duration_actual: int | None = None,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
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
    return _request(
        "POST", f"/sessions/{int(session_id)}/finish", payload, user_id=telegram_user_id
    )


@mcp.tool()
def list_measurements(
    limit: int = 20, telegram_user_id: int | None = None
) -> list[dict[str, Any]]:
    """List historical body measurements: weight, muscle, fat, source and date.

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
    }.items():
        if value is not None:
            body[key] = float(value)
    return _request("POST", "/profile/measurements", body, user_id=telegram_user_id)


@mcp.tool()
def session_web_url(
    session_id: int,
    planned_exercise_id: int | None = None,
    telegram_user_id: int | None = None,
) -> str:
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


@mcp.tool()
def dislike_exercise(exercise_id: int, telegram_user_id: int) -> dict[str, Any]:
    """Mark an exercise as disliked so it won't appear in future plans."""
    return _request(
        "POST",
        "/disliked-exercises",
        {"exercise_id": int(exercise_id)},
        user_id=telegram_user_id,
    )


@mcp.tool()
def undislike_exercise(exercise_id: int, telegram_user_id: int) -> dict[str, Any]:
    """Remove an exercise from the athlete's disliked list."""
    return _request(
        "DELETE", f"/disliked-exercises/{int(exercise_id)}", user_id=telegram_user_id
    )


@mcp.tool()
def get_progression_recommendation(
    exercise_id: int,
    policy: Literal["linear", "greyskull", "double", "bodyweight"] = "linear",
    target_reps: int = 10,
    reps_min: int = 8,
    reps_max: int = 12,
    telegram_user_id: int | None = None,
) -> dict[str, Any]:
    """Get mathematically sound progressive overload advice based on the athlete's history.

    policy:
      - linear: +2.5kg upper / +5kg lower on hit, 10% deload after 3 stalls.
      - greyskull: 2x target reps on AMRAP -> double jump; 1 miss -> 10% deload.
      - double: work within rep range (reps_min to reps_max), increase weight at top of range.
      - bodyweight: rep increments up to ceiling, then add set, then suggest load.
    """
    params = {
        "policy": policy,
        "target_reps": int(target_reps),
        "reps_min": int(reps_min),
        "reps_max": int(reps_max),
    }
    qs = urllib.parse.urlencode(params)
    return _request(
        "GET",
        f"/coach/progression/{int(exercise_id)}?{qs}",
        user_id=telegram_user_id,
    )


@mcp.tool()
def import_tracker_csv(csv_content: str, telegram_user_id: int) -> dict[str, Any]:
    """Bulk import historical workouts from Hevy, Strong, or FitNotes CSV export files.

    Fuzzy matches exercise names against the 1,324 exercise catalog, preserves set dates,
    weights, reps, RPE, and warmup tags.
    """
    user_id = _require_telegram_user_id(telegram_user_id, "import_tracker_csv")
    return _request(
        "POST",
        "/coach/import-csv",
        raw_body=csv_content,
        content_type="text/plain; charset=utf-8",
        user_id=user_id,
    )


if __name__ == "__main__":
    mcp.run()
