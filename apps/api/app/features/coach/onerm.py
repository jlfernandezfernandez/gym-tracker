"""1RM estimation and personal record (PR) calculation engine using Epley formula.

Based on exercise science:
- Only rep-based sets with external load (weight > 0) produce meaningful 1RM estimations.
- High-rep sets (>12 reps) test metabolic conditioning/work capacity, not maximal strength.
- Warm-up sets are excluded from 1RM and PR tracking.
"""

from __future__ import annotations

REP_CAP = 12


def calculate_1rm(weight: float | None, reps: int | None) -> float | None:
    """Calculate estimated 1RM from weight and reps using Epley formula.

    Returns None if:
    - weight or reps are missing/zero/negative
    - reps > REP_CAP (12)
    """
    if weight is None or reps is None:
        return None
    if weight <= 0 or reps < 1 or reps > REP_CAP:
        return None
    if reps == 1:
        return round(float(weight), 1)

    return round(float(weight) * (1.0 + reps / 30.0), 1)
