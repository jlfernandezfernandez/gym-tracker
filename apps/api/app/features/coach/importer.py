"""Bulk CSV importer for Hevy, Strong, and FitNotes exports.

Matches exercise names against catalog exercises and structures workouts into
sessions, planned exercises, and performed sets.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Any


def _normalize_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", name.lower())
    return " ".join(cleaned.split())


def parse_tracker_csv(csv_text: str) -> list[dict[str, Any]]:
    """Parse CSV rows into grouped workouts by date and routine."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return []

    header = rows[0]
    col_map = {col.strip().lower(): idx for idx, col in enumerate(header)}

    workouts_by_key: dict[str, dict[str, Any]] = {}

    def get_val(row_data: list[str], names: list[str]) -> str:
        for n in names:
            if n in col_map and col_map[n] < len(row_data):
                val = row_data[col_map[n]].strip()
                if val:
                    return val
        return ""

    for row in rows[1:]:
        if not row or not any(row):
            continue

        raw_date = get_val(row, ["date", "start_time", "created_at"])
        if not raw_date:
            continue

        # Parse date ISO YYYY-MM-DD
        session_date = None
        for dt_format in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y"):
            try:
                session_date = datetime.strptime(raw_date.split()[0], dt_format).date()
                break
            except Exception:
                continue

        if not session_date:
            try:
                session_date = date.fromisoformat(raw_date[:10])
            except Exception:
                continue

        workout_title = (
            get_val(row, ["workout name", "title", "routine", "routine_name"])
            or "Entreno importado"
        )
        exercise_name = get_val(row, ["exercise name", "exercise", "exercise_title", "name"])
        if not exercise_name:
            continue

        weight_str = get_val(
            row, ["weight (kg)", "weight (kgs)", "weight", "weight_kg", "weight (lbs)"]
        )
        reps_str = get_val(row, ["reps", "repetitions"])
        duration_str = get_val(row, ["duration", "time", "duration_minutes", "seconds"])
        rpe_str = get_val(row, ["rpe", "rir"])
        set_type = get_val(row, ["set type", "set_type", "type"]).lower()
        notes = get_val(row, ["notes", "comment", "note"])

        weight = float(weight_str) if weight_str and float(weight_str) > 0 else None
        reps = int(float(reps_str)) if reps_str and float(reps_str) > 0 else None
        duration_mins = None
        if duration_str:
            try:
                if ":" in duration_str:
                    parts = duration_str.split(":")
                    if len(parts) == 2:
                        duration_mins = int(parts[0]) + (int(parts[1]) // 60)
                    elif len(parts) == 3:
                        duration_mins = (int(parts[0]) * 60) + int(parts[1])
                else:
                    duration_mins = int(float(duration_str))
            except Exception:
                duration_mins = None

        rpe = float(rpe_str) if rpe_str and 1 <= float(rpe_str) <= 10 else None
        is_warmup = "warm" in set_type or "w" == set_type

        # Fallback if both weight and reps are missing
        if reps is None and duration_mins is None:
            reps = 10

        workout_key = f"{session_date.isoformat()}_{workout_title}"
        if workout_key not in workouts_by_key:
            workouts_by_key[workout_key] = {
                "session_date": session_date.isoformat(),
                "title": workout_title,
                "exercises_dict": {},
            }

        w_obj = workouts_by_key[workout_key]
        if exercise_name not in w_obj["exercises_dict"]:
            w_obj["exercises_dict"][exercise_name] = {
                "name": exercise_name,
                "sets": [],
            }

        w_obj["exercises_dict"][exercise_name]["sets"].append(
            {
                "weight": weight,
                "reps": reps,
                "duration_minutes": duration_mins,
                "rpe": rpe,
                "is_warmup": is_warmup,
                "notes": notes,
            }
        )

    result = []
    for w in workouts_by_key.values():
        result.append(
            {
                "session_date": w["session_date"],
                "title": w["title"],
                "exercises": list(w["exercises_dict"].values()),
            }
        )

    return result
