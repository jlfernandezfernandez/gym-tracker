import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "backend" / "exercise_data" / "exercises.json"
TAXONOMY = ROOT / "frontend" / "src" / "lib" / "exercise-taxonomy.json"
BODY_MAP_MUSCLES = {
    "abs",
    "abductors",
    "adductor",
    "back-deltoids",
    "biceps",
    "calves",
    "chest",
    "forearm",
    "front-deltoids",
    "gluteal",
    "hamstring",
    "lower-back",
    "neck",
    "obliques",
    "quadriceps",
    "trapezius",
    "triceps",
    "upper-back",
}


class ExerciseTaxonomyTest(unittest.TestCase):
    def test_catalog_terms_are_classified(self):
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        taxonomy = json.loads(TAXONOMY.read_text(encoding="utf-8"))
        terms = {
            str(term).strip().lower()
            for exercise in catalog
            for term in (
                exercise.get("body_part"),
                exercise.get("muscle_group"),
                *(exercise.get("secondary_muscles") or []),
            )
            if term
        }

        self.assertEqual(set(), terms - taxonomy.keys())
        for term, metadata in taxonomy.items():
            self.assertTrue(metadata["es"], term)
            self.assertLessEqual(set(metadata["bodyMap"]), BODY_MAP_MUSCLES, term)


if __name__ == "__main__":
    unittest.main()
