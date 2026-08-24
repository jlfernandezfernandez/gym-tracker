"""Progression recommendation engine.

Deterministic progression policies based on performance history:
- linear: Hit target reps in all sets -> increment load. 3 consecutive misses -> 10% deload.
- greyskull: AMRAP top set. Beat target by 2x -> double jump. 1 miss -> 10% deload.
- double: Rep range (e.g., 8-12). Top of range on all sets -> increment load, reset to bottom.
- bodyweight: Rep increments up to ceiling, then add set, then suggest load.
"""

from __future__ import annotations

from typing import Any, Literal

LOWER_BODY_PARTS = {
    "upper legs",
    "lower legs",
    "glutes",
    "hips",
    "quadriceps",
    "hamstrings",
    "calves",
}


def default_increment(body_part: str | None) -> float:
    if (body_part or "").lower() in LOWER_BODY_PARTS:
        return 5.0
    return 2.5


def recommend_progression(
    exercise_id: int,
    exercise_name: str,
    body_part: str,
    activity_type: str,
    history: list[dict[str, Any]],
    policy: Literal["linear", "greyskull", "double", "bodyweight"] = "linear",
    target_reps: int = 10,
    reps_min: int = 8,
    reps_max: int = 12,
) -> dict[str, Any]:
    """Derive next session's target load and reps with explanation."""
    inc = default_increment(body_part)

    if activity_type == "cardio":
        last_dur = history[0].get("duration_minutes") if history else 20
        return {
            "policy": "cardio",
            "suggested_duration_minutes": last_dur,
            "reason": "Cardio session maintains aerobic volume or coach-specified pacing.",
        }

    if not history:
        return {
            "policy": policy,
            "kind": "baseline",
            "suggested_weight": None,
            "suggested_reps": target_reps,
            "reason": (
                "No previous sessions logged for this exercise. Establish baseline performance."
            ),
        }

    last_session = history[0]
    last_sets = [s for s in last_session.get("sets", []) if not s.get("is_warmup", False)]
    if not last_sets:
        return {
            "policy": policy,
            "kind": "baseline",
            "suggested_weight": last_session.get("top_weight"),
            "suggested_reps": target_reps,
            "reason": "Previous session had only warm-ups or incomplete sets.",
        }

    last_weight = max((s.get("weight") or 0.0 for s in last_sets), default=0.0)
    all_hit = all((s.get("reps") or 0) >= target_reps for s in last_sets)

    # Bodyweight progression without load
    if last_weight == 0:
        last_reps = max((s.get("reps") or 0 for s in last_sets), default=target_reps)
        if all_hit:
            if last_reps >= reps_max:
                return {
                    "policy": "bodyweight",
                    "kind": "add_set_or_weight",
                    "suggested_weight": inc,
                    "suggested_reps": reps_min,
                    "suggested_sets": len(last_sets) + 1,
                    "reason": (
                        f"Hit ceiling of {reps_max} reps on bodyweight sets. "
                        f"Ready to add external load (+{inc} kg) or add an extra set."
                    ),
                }
            return {
                "policy": "bodyweight",
                "kind": "up_reps",
                "suggested_weight": 0.0,
                "suggested_reps": last_reps + 1,
                "reason": f"Hit target reps on all sets. Increase to {last_reps + 1} reps.",
            }
        return {
            "policy": "bodyweight",
            "kind": "hold",
            "suggested_weight": 0.0,
            "suggested_reps": target_reps,
            "reason": "Target reps not achieved on all sets. Repeat target load/reps.",
        }

    # Linear progression
    if policy == "linear":
        if all_hit:
            new_weight = round(last_weight + inc, 1)
            return {
                "policy": "linear",
                "kind": "increase",
                "suggested_weight": new_weight,
                "suggested_reps": target_reps,
                "reason": (
                    f"Completed all reps last session. Progressive overload "
                    f"+{inc} kg -> {new_weight} kg."
                ),
            }
        # Check for consecutive stalls (e.g. 3 sessions without hitting reps)
        stalls = sum(
            1
            for s in history[:3]
            if not all((st.get("reps") or 0) >= target_reps for st in s.get("sets", []))
        )
        if stalls >= 3:
            deload_weight = round(max(inc, last_weight * 0.9), 1)
            return {
                "policy": "linear",
                "kind": "deload",
                "suggested_weight": deload_weight,
                "suggested_reps": target_reps,
                "reason": (
                    f"Stalled for {stalls} consecutive sessions. "
                    f"Recommended 10% deload to {deload_weight} kg to rebuild momentum."
                ),
            }
        return {
            "policy": "linear",
            "kind": "hold",
            "suggested_weight": last_weight,
            "suggested_reps": target_reps,
            "reason": (
                f"Missed target reps last session. Maintain {last_weight} kg "
                f"and aim for clean reps."
            ),
        }

    # Greyskull LP
    if policy == "greyskull":
        final_set_reps = last_sets[-1].get("reps") or 0
        if final_set_reps >= target_reps * 2:
            new_weight = round(last_weight + (inc * 2), 1)
            return {
                "policy": "greyskull",
                "kind": "double_jump",
                "suggested_weight": new_weight,
                "suggested_reps": target_reps,
                "reason": (
                    f"AMRAP final set was {final_set_reps} reps (2x target!). "
                    f"Double progression jump +{inc * 2} kg -> {new_weight} kg."
                ),
            }
        if all_hit:
            new_weight = round(last_weight + inc, 1)
            return {
                "policy": "greyskull",
                "kind": "increase",
                "suggested_weight": new_weight,
                "suggested_reps": target_reps,
                "reason": f"All sets completed. Standard progression +{inc} kg -> {new_weight} kg.",
            }
        deload_weight = round(max(inc, last_weight * 0.9), 1)
        return {
            "policy": "greyskull",
            "kind": "deload",
            "suggested_weight": deload_weight,
            "suggested_reps": target_reps,
            "reason": f"Missed target on Greyskull set. Instant 10% reset to {deload_weight} kg.",
        }

    # Double progression
    if policy == "double":
        if all_hit and all((s.get("reps") or 0) >= reps_max for s in last_sets):
            new_weight = round(last_weight + inc, 1)
            return {
                "policy": "double",
                "kind": "increase",
                "suggested_weight": new_weight,
                "suggested_reps": reps_min,
                "reason": (
                    f"Reached top of rep range ({reps_max} reps) on all sets. "
                    f"Increase weight to {new_weight} kg and drop reps to {reps_min}."
                ),
            }
        return {
            "policy": "double",
            "kind": "hold",
            "suggested_weight": last_weight,
            "suggested_reps": min(
                reps_max, max(reps_min, (last_sets[0].get("reps") or reps_min) + 1)
            ),
            "reason": (
                f"Maintain {last_weight} kg and aim for more reps "
                f"within the {reps_min}-{reps_max} range."
            ),
        }

    return {
        "policy": "linear",
        "kind": "hold",
        "suggested_weight": last_weight,
        "suggested_reps": target_reps,
        "reason": "Maintain load.",
    }
