import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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
            {"set_number": 3, "is_warmup": False, "sensation": "", "notes": "", "weight": 40.0, "reps": 10},
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
            {"set_number": 1, "is_warmup": False, "duration_minutes": 25, "sensation": "", "notes": ""},
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


class TokenOptimizationTests(unittest.TestCase):
    def test_format_compact_set_weighted_with_rir(self) -> None:
        s = {"reps": 10, "weight": 80.0, "rir": 2.0, "is_warmup": False}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "10@80kg (2RIR)")

    def test_format_compact_set_weighted_with_rpe(self) -> None:
        s = {"reps": 8, "weight": 90.0, "rpe": 8.5, "is_warmup": False}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "8@90kg (@8.5RPE)")

    def test_format_compact_set_warmup(self) -> None:
        s = {"reps": 12, "weight": 50.0, "is_warmup": True}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "W:12@50kg")

    def test_format_compact_set_bodyweight(self) -> None:
        s = {"reps": 15, "weight": None, "is_warmup": False}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "15@BW")

    def test_format_compact_set_duration(self) -> None:
        s = {"duration_minutes": 25, "is_warmup": False}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "25m")

    def test_format_compact_set_warmup_duration(self) -> None:
        s = {"duration_minutes": 10, "is_warmup": True}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "W:10m")

    def test_format_compact_set_float_weight(self) -> None:
        s = {"reps": 8, "weight": 82.5, "rir": 1.0, "is_warmup": False}
        self.assertEqual(gym_tracker_mcp.format_compact_set(s), "8@82.5kg (1RIR)")


class TargetNotationTests(unittest.TestCase):
    def test_format_target_notation_weighted(self) -> None:
        pe = {"target_sets": 3, "target_reps": 10, "suggested_weight": 80.0}
        self.assertEqual(gym_tracker_mcp.format_target_notation(pe), "3x10@80kg")

    def test_format_target_notation_bodyweight(self) -> None:
        pe = {"target_sets": 4, "target_reps": 12}
        self.assertEqual(gym_tracker_mcp.format_target_notation(pe), "4x12@BW")

    def test_format_target_notation_duration(self) -> None:
        pe = {"target_sets": 1, "target_duration_minutes": 20}
        self.assertEqual(gym_tracker_mcp.format_target_notation(pe), "1x20m")


class DenseSnapshotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sample_raw_snapshot = {
            "profile": {
                "id": 1,
                "name": "Athlete",
                "telegram_user_id": 12345,
                "age": 28,
                "height_cm": 180.0,
                "weight_kg": 78.5,
                "goal": "hipertrofia",
                "experience_level": "intermedio",
                "notes": "",
                "preferred_exercises": "",
                "onboarding_complete": True,
            },
            "muscle_recovery": {
                "muscles": {
                    "chest": {
                        "muscle": "chest",
                        "readiness_pct": 32,
                        "fatigue_pct": 68,
                        "status": "fatigued",
                        "hours_since_trained": 18.0,
                    },
                    "triceps": {
                        "muscle": "triceps",
                        "readiness_pct": 60,
                        "fatigue_pct": 40,
                        "status": "recovering",
                        "hours_since_trained": 18.0,
                    },
                    "quadriceps": {
                        "muscle": "quadriceps",
                        "readiness_pct": 100,
                        "fatigue_pct": 0,
                        "status": "ready",
                        "hours_since_trained": None,
                    },
                },
                "ready": ["quadriceps", "hamstrings", "glutes"],
                "recovering": ["triceps"],
                "fatigued": ["chest"],
            },
            "active_session": {
                "session": {
                    "id": 10,
                    "title": "Torso A",
                    "status": "in_progress",
                    "session_date": "2026-08-24",
                    "planned_exercises": [
                        {
                            "id": 1,
                            "exercise_id": 45,
                            "order": 0,
                            "name": "Bench Press",
                            "target_sets": 3,
                            "target_reps": 8,
                            "suggested_weight": 80.0,
                            "status": "in_progress",
                            "performed_sets": [
                                {"reps": 8, "weight": 80.0, "rir": 2.0, "is_warmup": False},
                                {"reps": 8, "weight": 80.0, "rir": 1.0, "is_warmup": False},
                            ],
                        }
                    ],
                },
                "current": {
                    "current_exercise_name": "Bench Press",
                    "exercises_completed": 0,
                    "total_exercises": 1,
                    "current_set_number": 3,
                    "target_sets": 3,
                    "target_reps": 8,
                    "suggested_weight": 80.0,
                    "next_action": "log_set",
                },
            },
            "recent_sessions": [
                {
                    "id": 9,
                    "session_date": "2026-08-22",
                    "title": "Pierna B",
                    "status": "completed",
                    "energy": 8,
                    "duration_actual": 50,
                    "exercises": [
                        {
                            "exercise_id": 20,
                            "name": "Squat",
                            "order": 0,
                            "target_sets": 3,
                            "target_reps": 8,
                            "performed_sets": [
                                {"reps": 8, "weight": 100.0, "rir": 2.0, "is_warmup": False},
                                {"reps": 8, "weight": 100.0, "rir": 1.0, "is_warmup": False},
                                {"reps": 8, "weight": 100.0, "rir": 0.0, "is_warmup": False},
                            ],
                        }
                    ],
                }
            ],
            "recent_measurements": [
                {"measured_at": "2026-08-20", "weight_kg": 78.5, "source": "smart_scale"}
            ],
        }

    def test_format_dense_snapshot_structure(self) -> None:
        dense = gym_tracker_mcp.format_dense_snapshot(self.sample_raw_snapshot)

        # 1. Profile
        self.assertEqual(dense["profile"]["name"], "Athlete")
        self.assertEqual(dense["profile"]["weight_kg"], 78.5)
        self.assertNotIn("notes", dense["profile"])

        # 2. Recovery & Active Fatigue (Filtered to non-100% resting muscles)
        fatigued_muscles = [m["muscle"] for m in dense["active_fatigue"]]
        self.assertIn("chest", fatigued_muscles)
        self.assertIn("triceps", fatigued_muscles)
        self.assertNotIn("quadriceps", fatigued_muscles)

        # 3. Active Session
        active = dense["active_session"]
        self.assertIsNotNone(active)
        self.assertEqual(active["id"], 10)
        self.assertEqual(active["current_exercise"], "Bench Press")
        self.assertEqual(active["current_set"], 3)
        self.assertEqual(active["exercises"][0]["sets"], ["8@80kg (2RIR)", "8@80kg (1RIR)"])

        # 4. Recent History
        history = dense["recent_sessions"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["title"], "Pierna B")
        self.assertIn("Squat: [8@100kg (2RIR), 8@100kg (1RIR), 8@100kg (0RIR)]", history[0]["sets"])

    def test_training_snapshot_tool_execution(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value=self.sample_raw_snapshot) as req:
            result = gym_tracker_mcp.training_snapshot(telegram_user_id=12345, session_limit=5)

        req.assert_called_once_with("GET", "/coach/snapshot?limit=5", user_id=12345)
        self.assertEqual(result["profile"]["name"], "Athlete")
        self.assertIn("active_fatigue", result)
        self.assertIn("recent_sessions", result)

    def test_training_snapshot_requires_user_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "telegram_user_id is required"):
            gym_tracker_mcp.training_snapshot(telegram_user_id=None)  # type: ignore[arg-type]


class AdditionalMcpToolsTests(unittest.TestCase):
    def test_health_check(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={"status": "ok"}) as req:
            res = gym_tracker_mcp.health()
        req.assert_called_once_with("GET", "/health")
        self.assertEqual(res, {"status": "ok"})

    def test_athlete_profile_tools(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={"name": "Alex"}) as req:
            gym_tracker_mcp.get_athlete_profile(telegram_user_id=7)
        req.assert_called_once_with("GET", "/profile", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.patch_athlete_profile({"goal": "fuerza"}, telegram_user_id=7)
        req.assert_called_once_with("PATCH", "/profile", {"goal": "fuerza"}, user_id=7)

    def test_catalog_tools(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value=[]) as req:
            gym_tracker_mcp.list_exercises(search="press", limit=5)
        req.assert_called_once_with("GET", "/exercises?limit=5&offset=0&search=press", user_id=None)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.get_exercise(42)
        req.assert_called_once_with("GET", "/exercises/42")

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.list_exercise_facets()
        req.assert_called_once_with("GET", "/exercises/facets")

        with patch.object(gym_tracker_mcp, "_request", return_value=[]) as req:
            gym_tracker_mcp.exercise_progress(12, limit=10, telegram_user_id=7)
        req.assert_called_once_with("GET", "/exercises/12/progress?limit=10", user_id=7)

    def test_session_management_tools(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.get_session(10, telegram_user_id=7)
        req.assert_called_once_with("GET", "/sessions/10", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value=[]) as req:
            gym_tracker_mcp.list_sessions(limit=5, telegram_user_id=7)
        req.assert_called_once_with("GET", "/sessions?limit=5", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.get_active_session(telegram_user_id=7)
        req.assert_called_once_with("GET", "/sessions/active", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.get_current_state(10, telegram_user_id=7)
        req.assert_called_once_with("GET", "/sessions/10/current", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.complete_exercise(10, 2, telegram_user_id=7)
        req.assert_called_once_with("POST", "/sessions/10/exercises/2/complete", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.update_session({"energy": 9}, 10, telegram_user_id=7)
        req.assert_called_once_with("PATCH", "/sessions/10", {"energy": 9}, user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.finish_session(10, feedback="Genial", energy=8, telegram_user_id=7)
        req.assert_called_once_with(
            "POST",
            "/sessions/10/finish",
            {"feedback": "Genial", "energy": 8, "discomfort": ""},
            user_id=7,
        )

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.delete_session(10, telegram_user_id=7)
        req.assert_called_once_with("DELETE", "/sessions/10", user_id=7)

    def test_measurements_and_urls(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value=[]) as req:
            gym_tracker_mcp.list_measurements(limit=5, telegram_user_id=7)
        req.assert_called_once_with("GET", "/profile/measurements?limit=5", user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.record_body_measurement(7, weight_kg=79.0, notes="Ayunas")
        req.assert_called_once_with(
            "POST",
            "/profile/measurements",
            {"source": "manual", "notes": "Ayunas", "weight_kg": 79.0},
            user_id=7,
        )

        with patch.object(gym_tracker_mcp, "_request", return_value={"share_token": "token123"}):
            url = gym_tracker_mcp.session_web_url(10, planned_exercise_id=2, telegram_user_id=7)
        self.assertIn("/session/share/token123/exercise/2", url)

        share_url = gym_tracker_mcp.share_web_url("abc-xyz")
        self.assertIn("/session/share/abc-xyz", share_url)

    def test_coach_tools(self) -> None:
        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.get_progression_recommendation(12, policy="linear", telegram_user_id=7)
        req.assert_called_once_with(
            "GET",
            "/coach/progression/12?policy=linear&target_reps=10&reps_min=8&reps_max=12",
            user_id=7,
        )

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.dislike_exercise(15, telegram_user_id=7)
        req.assert_called_once_with("POST", "/disliked-exercises", {"exercise_id": 15}, user_id=7)

        with patch.object(gym_tracker_mcp, "_request", return_value={}) as req:
            gym_tracker_mcp.undislike_exercise(15, telegram_user_id=7)
        req.assert_called_once_with("DELETE", "/disliked-exercises/15", user_id=7)


if __name__ == "__main__":
    unittest.main()

