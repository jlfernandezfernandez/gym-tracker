import unittest

from fastapi import HTTPException

from models import PerformedSet, PlannedExercise
from routers.sessions import _ensure_replaceable


class SessionIntegrityTest(unittest.TestCase):
    def test_logged_exercise_cannot_be_replaced(self):
        planned = PlannedExercise(exercise_id=1)
        planned.performed_sets = [PerformedSet(set_number=1, reps=10)]

        with self.assertRaises(HTTPException) as error:
            _ensure_replaceable(planned)

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(planned.exercise_id, 1)
        self.assertEqual(len(planned.performed_sets), 1)


if __name__ == "__main__":
    unittest.main()
