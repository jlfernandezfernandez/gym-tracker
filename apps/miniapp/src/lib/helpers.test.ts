import { describe, expect, it } from 'vitest';
import {
  canEditWorkout,
  currentExercise,
  executionMetricPayload,
  formatMuscle,
  formatWeight,
  missingSetNumbers,
  normalizeSession,
  parseWeight,
} from './helpers';

describe('parseWeight', () => {
  it('parses comma decimal', () => {
    expect(parseWeight('2,5')).toBe(2.5);
  });

  it('parses dot decimal', () => {
    expect(parseWeight('2.5')).toBe(2.5);
  });

  it('parses integer', () => {
    expect(parseWeight('10')).toBe(10);
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseWeight('abc')).toBeNaN();
  });
});

describe('formatWeight', () => {
  it('formats bodyweight mode', () => {
    expect(formatWeight(null, 'bodyweight')).toBe('Peso corporal');
  });

  it('formats weighted mode', () => {
    expect(formatWeight(12.5, 'weighted')).toBe('12.5 kg');
  });

  it('formats unloaded mode with null/undefined', () => {
    expect(formatWeight(null, 'unloaded')).toBe('');
    expect(formatWeight(undefined, 'unloaded')).toBe('');
  });
});

describe('executionMetricPayload', () => {
  it('emits only the metric fields for the activity domain', () => {
    expect(executionMetricPayload('cardio', { duration_minutes: 20, reps: 20, weight: 5 }))
      .toEqual({ duration_minutes: 20 });
    expect(executionMetricPayload('strength', { duration_minutes: 20, reps: 10, weight: 40 }))
      .toEqual({ reps: 10, weight: 40 });
  });
});

describe('normalizeSession', () => {
  it('carries strength asymmetry into the workout view', () => {
    expect(normalizeSession({ planned_exercises: [{ id: 7, order: 0, exercise_id: 9, unilateral: true, target_reps: 10, exercise: { activity_type: 'strength' } }] }).exercises[0].unilateral).toBe(true);
    expect(normalizeSession({ planned_exercises: [{ id: 8, order: 0, exercise_id: 10, target_reps: 10, exercise: { activity_type: 'strength' } }] }).exercises[0].unilateral).toBe(false);
  });

  it('normalizes cardio with minutes and no reps fallback', () => {
    const exercise = normalizeSession({
      planned_exercises: [{
        id: 9,
        order: 0,
        exercise_id: 11,
        target_sets: 1,
        target_reps: null,
        target_duration_minutes: 25,
        exercise: { activity_type: 'cardio' },
      }],
    }).exercises[0];
    expect(exercise.activity_type).toBe('cardio');
    expect(exercise.duration_minutes).toBe(25);
    expect(exercise.reps).toBeNull();
  });
});

describe('series workspace', () => {
  it('selects the first missing set number after deleting a middle set', () => {
    const exercise = { sets: 3, performed_sets: [{ set_number: 1 }, { set_number: 3 }] };
    expect(missingSetNumbers(exercise)).toEqual([2]);
  });

  it('keeps a completed session non-editable even if an exercise remains pending', () => {
    expect(canEditWorkout(false, 'completed', 'pending')).toBe(false);
    expect(canEditWorkout(false, 'in_progress', 'completed')).toBe(false);
    expect(canEditWorkout(false, 'in_progress', 'in_progress')).toBe(true);
  });

  it('keeps every share-token route read-only, including Telegram launches', () => {
    expect(canEditWorkout(true, 'in_progress', 'in_progress')).toBe(false);
  });
});

describe('currentExercise', () => {
  const exercises = [
    { planned_id: 1, status: 'completed' },
    { planned_id: 2, status: 'in_progress' },
    { planned_id: 3, status: 'pending' },
  ];

  it('keeps the only exercise in progress', () => {
    expect(currentExercise({ exercises }, { current_planned_exercise_id: 2 })?.planned_id).toBe(2);
  });

  it('uses the first pending exercise when no exercise is in progress', () => {
    const pendingExercises = [
      { planned_id: 1, status: 'completed' },
      { planned_id: 2, status: 'pending' },
      { planned_id: 3, status: 'pending' },
    ];
    expect(currentExercise({ exercises: pendingExercises }, { current_planned_exercise_id: 3 })?.planned_id).toBe(2);
  });

  it('does not treat a backend pending pointer as in progress', () => {
    const pendingExercises = exercises.filter((exercise) => exercise.planned_id !== 2);
    expect(currentExercise({ exercises: pendingExercises }, { current_planned_exercise_id: 3 })?.planned_id).toBe(3);
  });
});

describe('formatMuscle', () => {
  it('translates English muscle keys and aliases into Spanish', () => {
    expect(formatMuscle('abs')).toBe('Abdominales');
    expect(formatMuscle('shoulders')).toBe('Hombros');
    expect(formatMuscle('chest')).toBe('Pecho');
    expect(formatMuscle('hip flexors')).toBe('Flexores de cadera');
    expect(formatMuscle('hip_flexors')).toBe('Flexores de cadera');
    expect(formatMuscle('lower back')).toBe('Espalda baja');
    expect(formatMuscle('lower_back')).toBe('Espalda baja');
    expect(formatMuscle('quads')).toBe('Cuádriceps');
    expect(formatMuscle('hamstrings')).toBe('Isquiotibiales');
    expect(formatMuscle('glutes')).toBe('Glúteos');
    expect(formatMuscle('calves')).toBe('Gemelos');
  });

  it('handles empty and already formatted strings', () => {
    expect(formatMuscle('')).toBe('');
    expect(formatMuscle('Pecho')).toBe('Pecho');
    expect(formatMuscle('Abdominales')).toBe('Abdominales');
  });
});

