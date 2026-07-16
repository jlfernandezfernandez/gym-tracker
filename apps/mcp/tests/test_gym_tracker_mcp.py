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


class DeletePlannedExerciseTests(unittest.TestCase):
    def test_delete_calls_correct_endpoint(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.delete_planned_exercise(
                session_id=7,
                planned_exercise_id=50,
                telegram_user_id=42,
            )

        request.assert_called_once_with(
            "DELETE",
            "/sessions/7/exercises/50",
            user_id=42,
        )

    def test_delete_without_user_id(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.delete_planned_exercise(
                session_id=7,
                planned_exercise_id=50,
            )

        request.assert_called_once_with(
            "DELETE",
            "/sessions/7/exercises/50",
            user_id=None,
        )


if __name__ == "__main__":
    unittest.main()
