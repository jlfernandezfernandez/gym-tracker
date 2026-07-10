import unittest

from models import BODYWEIGHT_WEIGHT, PerformedSet, PlannedExercise, WorkoutSession


class WeightDomainTest(unittest.TestCase):
    def test_bodyweight_never_adds_negative_volume(self):
        bodyweight_set = PerformedSet(weight=BODYWEIGHT_WEIGHT, reps=12)
        loaded_set = PerformedSet(weight=20, reps=8)
        session = WorkoutSession()
        session.planned_exercises = [
            PlannedExercise(suggested_weight=BODYWEIGHT_WEIGHT, performed_sets=[bodyweight_set]),
            PlannedExercise(suggested_weight=20, performed_sets=[loaded_set]),
        ]

        self.assertEqual(bodyweight_set.weight_mode, "bodyweight")
        self.assertEqual(session.total_volume, 160)


if __name__ == "__main__":
    unittest.main()
