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
                target_reps=10,
                telegram_user_id=7,
            )

        request.assert_called_once_with(
            "POST",
            "/sessions/12/exercises",
            {
                "exercise_id": 42,
                "target_sets": 3,
                "target_reps": 10,
                "notes": "",
                "unilateral": False,
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
                "unilateral": False,
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
                target_reps=10,
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
                "notes": "",
                "unilateral": False,
                "set_targets": targets,
            },
            user_id=7,
        )


class SessionMutationTests(unittest.TestCase):
    def test_restore_set_calls_endpoint(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.restore_set(1, 2, 3, 10, weight=40, telegram_user_id=7)
        request.assert_called_once_with(
            "POST",
            "/sessions/1/exercises/2/sets/restore",
            {"set_number": 3, "reps": 10, "sensation": "", "notes": "", "weight": 40.0},
            user_id=7,
        )

    def test_reclassify_preserves_sets_contract(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.reclassify_performed_exercise(
                1, 2, 99, "corrección", telegram_user_id=7
            )
        request.assert_called_once_with(
            "POST",
            "/sessions/1/exercises/2/reclassify",
            {"new_exercise_id": 99, "reason": "corrección"},
            user_id=7,
        )

    def test_reorder_requires_complete_order_payload(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.reorder_session_exercises(1, [4, 2, 3], telegram_user_id=7)
        request.assert_called_once_with(
            "PUT",
            "/sessions/1/exercises/reorder",
            {"planned_exercise_ids": [4, 2, 3]},
            user_id=7,
        )

    def test_correction_tools_require_telegram_user_id_locally(self) -> None:
        with self.assertRaisesRegex(ValueError, "telegram_user_id is required"):
            gym_tracker_mcp.restore_set(1, 2, 1, 10)
        with self.assertRaisesRegex(ValueError, "telegram_user_id is required"):
            gym_tracker_mcp.reclassify_performed_exercise(1, 2, 99)
        with self.assertRaisesRegex(ValueError, "telegram_user_id is required"):
            gym_tracker_mcp.reorder_session_exercises(1, [2])


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


class CardioContractTests(unittest.TestCase):
    def test_create_plan_forwards_native_cardio_contract(self) -> None:
        exercises = [
            {
                "exercise_id": 9,
                "order": 0,
                "target_sets": 1,
                "target_duration_minutes": 20,
            }
        ]
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.create_plan(
                title="Cardio",
                exercises=exercises,
                telegram_user_id=7,
            )

        request.assert_called_once_with(
            "POST",
            "/coach/plan",
            {
                "title": "Cardio",
                "goal": "",
                "energy": 5,
                "time_available": 45,
                "discomfort": "",
                "exercises": exercises,
            },
            user_id=7,
        )

    def test_import_forwards_cardio_minutes(self) -> None:
        exercises = [{"exercise_id": 9, "sets": [{"duration_minutes": 30}]}]
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.import_completed_session(
                session_date="2026-08-01",
                exercises=exercises,
                telegram_user_id=7,
            )

        assert request.call_args.args[2]["exercises"] == exercises

    def test_log_set_sends_minutes_without_reps_or_weight(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.log_set(
                session_id=1,
                planned_exercise_id=2,
                set_number=1,
                duration_minutes=25,
                telegram_user_id=7,
            )
        request.assert_called_once_with(
            "POST",
            "/sessions/1/exercises/2/sets",
            {"set_number": 1, "duration_minutes": 25, "sensation": "", "notes": ""},
            user_id=7,
        )

    def test_add_cardio_uses_target_minutes_without_target_reps(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
            gym_tracker_mcp.add_planned_exercise(
                session_id=1,
                exercise_id=42,
                target_sets=1,
                target_duration_minutes=20,
                telegram_user_id=7,
            )
        request.assert_called_once_with(
            "POST",
            "/sessions/1/exercises",
            {
                "exercise_id": 42,
                "target_sets": 1,
                "target_duration_minutes": 20,
                "notes": "",
                "unilateral": False,
            },
            user_id=7,
        )

    def test_log_set_rejects_mixed_cardio_and_strength_metrics(self) -> None:
        with self.assertRaisesRegex(ValueError, "exactly one"):
            gym_tracker_mcp.log_set(1, 2, 1, reps=10, duration_minutes=10)
        with self.assertRaisesRegex(ValueError, "does not accept weight"):
            gym_tracker_mcp.log_set(1, 2, 1, duration_minutes=10, weight=5)

    def test_create_plan_rejects_cardio_weight_or_unilateral(self) -> None:
        base = {
            "exercise_id": 9,
            "target_sets": 1,
            "target_duration_minutes": 20,
        }
        for invalid in (
            {**base, "suggested_weight": 5},
            {**base, "unilateral": True},
        ):
            with self.assertRaises(ValueError):
                gym_tracker_mcp.create_plan(exercises=[invalid], telegram_user_id=7)


if __name__ == "__main__":
    unittest.main()
