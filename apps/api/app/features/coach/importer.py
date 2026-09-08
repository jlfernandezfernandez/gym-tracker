"""Bulk CSV importer for Hevy, Strong, and FitNotes exports.

Matches exercise names against catalog exercises and structures workouts into
sessions, planned exercises, and performed sets.
"""

from __future__ import annotations

import csv
import io
import math
import re
from datetime import date, datetime
from typing import Any


class TrackerCsvImportError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def _normalize_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", name.lower())
    return " ".join(cleaned.split())


def _parse_positive_number(raw_value: str, *, label: str, row_number: int) -> float:
    value = _parse_finite_number(raw_value, label=label, row_number=row_number)
    if value <= 0:
        raise TrackerCsvImportError([f"Row {row_number}: {label} must be greater than zero"])
    return value


def _parse_finite_number(raw_value: str, *, label: str, row_number: int) -> float:
    try:
        value = float(raw_value)
    except ValueError as error:
        raise TrackerCsvImportError(
            [f"Row {row_number}: {label} must be numeric, got '{raw_value}'"]
        ) from error
    if not math.isfinite(value):
        raise TrackerCsvImportError([f"Row {row_number}: {label} must be finite"])
    return value


def _parse_weight(raw_value: str, *, label: str, row_number: int) -> float | None:
    value = _parse_finite_number(raw_value, label=label, row_number=row_number)
    if value == 0:
        return None
    if value < 0:
        raise TrackerCsvImportError([f"Row {row_number}: {label} must be zero or greater"])
    return value


def _parse_bounded_number(
    raw_value: str,
    *,
    label: str,
    row_number: int,
    minimum: float,
    maximum: float,
) -> float:
    value = _parse_finite_number(raw_value, label=label, row_number=row_number)
    if not minimum <= value <= maximum:
        if label == "rpe":
            raise TrackerCsvImportError([f"Row {row_number}: {label} must be between 1 and 10"])
        raise TrackerCsvImportError([f"Row {row_number}: {label} must be between 0 and 10"])
    return value


def _parse_date(raw_date: str, row_number: int) -> date:
    for dt_format in (
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d.%m.%Y",
    ):
        try:
            return datetime.strptime(raw_date, dt_format).date()
        except ValueError:
            continue
    try:
        return date.fromisoformat(raw_date[:10])
    except ValueError as error:
        raise TrackerCsvImportError(
            [f"Row {row_number}: unsupported date format '{raw_date}'"]
        ) from error


def _parse_duration_clock(raw_value: str, row_number: int) -> int:
    parts = raw_value.split(":")
    if len(parts) not in (2, 3) or any(not part.isdigit() for part in parts):
        raise TrackerCsvImportError(
            [f"Row {row_number}: duration '{raw_value}' must be mm:ss or hh:mm:ss"]
        )
    if len(parts) == 2:
        minutes, seconds = int(parts[0]), int(parts[1])
        total_seconds = minutes * 60 + seconds
    else:
        hours, minutes, seconds = (int(part) for part in parts)
        total_seconds = hours * 3600 + minutes * 60 + seconds
    if total_seconds % 60 != 0:
        raise TrackerCsvImportError(
            [
                (
                    f"Row {row_number}: duration '{raw_value}' must convert to whole"
                    " minutes for the current API contract"
                )
            ]
        )
    return total_seconds // 60


def _parse_duration(raw_value: str, *, label: str, row_number: int) -> int:
    normalized = raw_value.strip().lower()
    if not normalized:
        raise TrackerCsvImportError([f"Row {row_number}: {label} is empty"])
    if ":" in normalized:
        return _parse_duration_clock(normalized, row_number)
    minute_match = re.fullmatch(
        r"([0-9]+(?:\.[0-9]+)?)\s*(m|min|mins|minute|minutes)",
        normalized,
    )
    if minute_match:
        minutes = _parse_positive_number(minute_match.group(1), label=label, row_number=row_number)
        if not minutes.is_integer():
            raise TrackerCsvImportError(
                [f"Row {row_number}: {label} must resolve to a whole number of minutes"]
            )
        return int(minutes)
    second_match = re.fullmatch(
        r"([0-9]+(?:\.[0-9]+)?)\s*(s|sec|secs|second|seconds)",
        normalized,
    )
    if second_match:
        seconds = _parse_positive_number(second_match.group(1), label=label, row_number=row_number)
        if seconds % 60 != 0:
            raise TrackerCsvImportError(
                [f"Row {row_number}: {label} in seconds must convert to whole minutes"]
            )
        return int(seconds // 60)
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", normalized):
        raise TrackerCsvImportError(
            [
                (
                    f"Row {row_number}: {label} '{raw_value}' is ambiguous without"
                    " units; use minutes, mm:ss, hh:mm:ss or an explicit seconds"
                    " column"
                )
            ]
        )
    raise TrackerCsvImportError(
        [
            (
                f"Row {row_number}: unsupported duration format '{raw_value}'."
                " Use minutes, mm:ss, hh:mm:ss or explicit seconds"
            )
        ]
    )


def parse_tracker_csv(csv_text: str) -> list[dict[str, Any]]:
    """Parse CSV rows into grouped workouts by date and routine."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return []

    field_map = {field.strip().lower(): field for field in reader.fieldnames if field}
    workouts_by_key: dict[str, dict[str, Any]] = {}
    errors: list[str] = []

    def get_val(row_data: dict[str, str | None], names: list[str]) -> str:
        for name in names:
            key = field_map.get(name)
            if key:
                value = (row_data.get(key) or "").strip()
                if value:
                    return value
        return ""

    for row_number, row in enumerate(reader, start=2):
        if not row or not any((value or "").strip() for value in row.values()):
            continue

        raw_date = get_val(row, ["date", "start_time", "created_at"])
        if not raw_date:
            errors.append(f"Row {row_number}: missing date/start_time/created_at")
            continue
        try:
            session_date = _parse_date(raw_date, row_number)
        except TrackerCsvImportError as error:
            errors.extend(error.errors)
            continue

        workout_title = (
            get_val(row, ["workout name", "title", "routine", "routine_name"])
            or "Entreno importado"
        )
        exercise_name = get_val(
            row,
            ["exercise name", "exercise", "exercise_title", "name"],
        )
        if not exercise_name:
            errors.append(f"Row {row_number}: missing exercise name")
            continue

        weight_kg_str = get_val(row, ["weight (kg)", "weight (kgs)", "weight_kg"])
        weight_lbs_str = get_val(row, ["weight (lb)", "weight (lbs)", "weight_lbs"])
        generic_weight_str = get_val(row, ["weight"])
        weight_unit = get_val(row, ["weight unit", "weight_unit", "unit"])
        reps_str = get_val(row, ["reps", "repetitions"])
        duration_minutes_str = get_val(
            row,
            ["duration_minutes", "duration (minutes)", "minutes", "time (minutes)"],
        )
        seconds_str = get_val(
            row,
            ["seconds", "duration_seconds", "duration (seconds)"],
        )
        duration_str = get_val(row, ["duration", "time"])
        rpe_str = get_val(row, ["rpe"])
        rir_str = get_val(row, ["rir"])
        set_type = get_val(row, ["set type", "set_type", "type"]).lower()
        notes = get_val(row, ["notes", "comment", "note"])

        try:
            weight = None
            if weight_kg_str and weight_lbs_str:
                raise TrackerCsvImportError(
                    [
                        (
                            f"Row {row_number} ({exercise_name}): weight cannot"
                            " include both kg and lbs columns"
                        )
                    ]
                )
            if weight_kg_str:
                weight = _parse_weight(weight_kg_str, label="weight (kg)", row_number=row_number)
            elif weight_lbs_str:
                pounds = _parse_weight(weight_lbs_str, label="weight (lbs)", row_number=row_number)
                weight = None if pounds is None else round(pounds * 0.45359237, 3)
            elif generic_weight_str:
                normalized_unit = weight_unit.strip().lower()
                generic_weight = _parse_weight(
                    generic_weight_str, label="weight", row_number=row_number
                )
                if normalized_unit in {"kg", "kgs", "kilogram", "kilograms"}:
                    weight = generic_weight
                elif normalized_unit in {"lb", "lbs", "pound", "pounds"}:
                    weight = (
                        None if generic_weight is None else round(generic_weight * 0.45359237, 3)
                    )
                else:
                    raise TrackerCsvImportError(
                        [
                            (
                                f"Row {row_number} ({exercise_name}): weight"
                                f" '{generic_weight_str}' needs an explicit unit"
                                " column with kg or lbs"
                            )
                        ]
                    )

            reps = None
            if reps_str:
                reps_value = _parse_positive_number(reps_str, label="reps", row_number=row_number)
                if not reps_value.is_integer():
                    raise TrackerCsvImportError([f"Row {row_number}: reps must be a whole number"])
                reps = int(reps_value)

            duration_mins = None
            if duration_minutes_str:
                minutes = _parse_positive_number(
                    duration_minutes_str,
                    label="duration_minutes",
                    row_number=row_number,
                )
                if not minutes.is_integer():
                    raise TrackerCsvImportError(
                        [f"Row {row_number}: duration_minutes must be a whole number"]
                    )
                duration_mins = int(minutes)
            elif seconds_str:
                if weight is not None:
                    raise TrackerCsvImportError(
                        [
                            (
                                f"Row {row_number} ({exercise_name}): explicit seconds"
                                " with load are not supported in CSV import; use"
                                " the JSON import contract for timed strength"
                            )
                        ]
                    )
                seconds = _parse_positive_number(
                    seconds_str, label="seconds", row_number=row_number
                )
                if seconds % 60 != 0:
                    raise TrackerCsvImportError(
                        [
                            (
                                f"Row {row_number} ({exercise_name}): seconds must"
                                " convert to whole minutes for the current API"
                                " contract"
                            )
                        ]
                    )
                duration_mins = int(seconds // 60)
            elif duration_str:
                duration_mins = _parse_duration(
                    duration_str,
                    label="duration",
                    row_number=row_number,
                )

            rpe = None
            if rpe_str:
                rpe = _parse_bounded_number(
                    rpe_str,
                    label="rpe",
                    row_number=row_number,
                    minimum=1,
                    maximum=10,
                )

            rir = None
            if rir_str:
                rir = _parse_bounded_number(
                    rir_str,
                    label="rir",
                    row_number=row_number,
                    minimum=0,
                    maximum=10,
                )

            if reps is None and duration_mins is None:
                raise TrackerCsvImportError(
                    [
                        (
                            f"Row {row_number} ({exercise_name}): provide reps for"
                            " strength or duration_minutes/seconds for cardio; no"
                            " metrics were found"
                        )
                    ]
                )
        except TrackerCsvImportError as error:
            errors.extend(error.errors)
            continue

        workout_key = f"{session_date.isoformat()}_{workout_title}"
        if workout_key not in workouts_by_key:
            workouts_by_key[workout_key] = {
                "session_date": session_date.isoformat(),
                "title": workout_title,
                "exercises_dict": {},
            }

        workout = workouts_by_key[workout_key]
        if exercise_name not in workout["exercises_dict"]:
            workout["exercises_dict"][exercise_name] = {
                "name": exercise_name,
                "sets": [],
            }

        workout["exercises_dict"][exercise_name]["sets"].append(
            {
                "weight": weight,
                "reps": reps,
                "duration_minutes": duration_mins,
                "rpe": rpe,
                "rir": rir,
                "is_warmup": "warm" in set_type or set_type == "w",
                "notes": notes,
            }
        )

    if errors:
        raise TrackerCsvImportError(errors)

    return [
        {
            "session_date": workout["session_date"],
            "title": workout["title"],
            "exercises": list(workout["exercises_dict"].values()),
        }
        for workout in workouts_by_key.values()
    ]
