import unittest
from unittest.mock import patch

import gym_tracker_mcp


class UpdatePlannedExerciseTests(unittest.TestCase):
    def test_replacing_exercise_without_status_preserves_current_status(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.update_planned_exercise(
                session_id=12,
                planned_exercise_id=50,
                new_exercise_id=954,
                telegram_user_id=42,
            )

        request.assert_called_once_with(
            "PUT",
            "/sessions/12/exercises/50",
            {"new_exercise_id": 954},
            user_id=42,
        )

    def test_set_targets_forwarded_to_api(self) -> None:
        targets = [
            {"set_number": 1, "weight": 40, "reps": 12},
            {"set_number": 2, "weight": 45, "reps": 10},
        ]
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.update_planned_exercise(
                session_id=8,
                planned_exercise_id=34,
                set_targets=targets,
                telegram_user_id=42,
            )

        request.assert_called_once_with(
            "PUT",
            "/sessions/8/exercises/34",
            {"set_targets": targets},
            user_id=42,
        )


class AddPlannedExerciseTests(unittest.TestCase):
    def test_add_exercise_appends_at_end(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.add_planned_exercise(
                session_id=12,
                exercise_id=42,
                telegram_user_id=7,
            )

        request.assert_called_once_with(
            "POST",
            "/sessions/12/exercises",
            {
                "exercise_id": 42,
                "target_sets": 3,
                "target_reps": 10,
                "suggested_weight": 0.0,
                "notes": "",
            },
            user_id=7,
        )

    def test_add_exercise_with_explicit_order(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.add_planned_exercise(
                session_id=12,
                exercise_id=42,
                order=2,
                target_sets=4,
                target_reps=8,
                suggested_weight=50.0,
                notes="controla la bajada",
                telegram_user_id=7,
            )

        request.assert_called_once_with(
            "POST",
            "/sessions/12/exercises",
            {
                "exercise_id": 42,
                "order": 2,
                "target_sets": 4,
                "target_reps": 8,
                "suggested_weight": 50.0,
                "notes": "controla la bajada",
            },
            user_id=7,
        )

    def test_add_exercise_with_set_targets(self) -> None:
        targets = [
            {"set_number": 1, "weight": 40, "reps": 12},
            {"set_number": 2, "weight": 45, "reps": 10},
        ]
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.add_planned_exercise(
                session_id=5,
                exercise_id=20,
                set_targets=targets,
                telegram_user_id=7,
            )

        request.assert_called_once_with(
            "POST",
            "/sessions/5/exercises",
            {
                "exercise_id": 20,
                "target_sets": 3,
                "target_reps": 10,
                "suggested_weight": 0.0,
                "notes": "",
                "set_targets": targets,
            },
            user_id=7,
        )


if __name__ == "__main__":
    unittest.main()
