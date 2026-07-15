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


if __name__ == "__main__":
    unittest.main()
