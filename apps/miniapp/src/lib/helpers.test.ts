import { describe, expect, it } from 'vitest';
import {
  canEditWorkout,
  currentExercise,
  executionMetricPayload,
  formatExerciseTargetBadge,
  formatMuscle,
  formatWeight,
  missingSetNumbers,
  normalizeSession,
  parseWeight,
  resolveCurrentSetNumber,
  resolveSetTarget,
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
    expect(executionMetricPayload('duration_minutes', { duration_minutes: 20, reps: 20, duration_seconds: 45, weight: 5 }))
      .toEqual({ duration_minutes: 20 });
    expect(executionMetricPayload('reps', { duration_minutes: 20, reps: 10, duration_seconds: 45, weight: 40 }))
      .toEqual({ reps: 10, weight: 40 });
    expect(executionMetricPayload('duration_seconds', { duration_minutes: 20, reps: 10, duration_seconds: 45, weight: 40 }))
      .toEqual({ duration_seconds: 45, weight: 40 });
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
    expect(exercise.execution_metric).toBe('duration_minutes');
    expect(exercise.duration_minutes).toBe(25);
    expect(exercise.reps).toBeNull();
  });

  it('normalizes timed strength with explicit seconds contract', () => {
    const exercise = normalizeSession({
      planned_exercises: [{
        id: 10,
        order: 0,
        exercise_id: 12,
        target_sets: 2,
        execution_metric: 'duration_seconds',
        target_reps: null,
        target_duration_minutes: null,
        target_duration_seconds: 40,
        suggested_weight: 32.5,
        set_targets: [{ set_number: 1, weight: 32.5, duration_seconds: 40 }],
        exercise: { activity_type: 'strength' },
      }],
    }).exercises[0];

    expect(exercise.activity_type).toBe('strength');
    expect(exercise.execution_metric).toBe('duration_seconds');
    expect(exercise.duration_seconds).toBe(40);
    expect(exercise.reps).toBeNull();
  });
});

describe('series workspace', () => {
  it.each([
    [{ weight: null }, 40],
    [{ weight: null, unloaded: false }, 40],
    [{}, 40],
    [{ weight: 35 }, 35],
    [{ weight: null, unloaded: true }, null],
    [{ unloaded: true }, null],
  ])('resolves historical and explicit unloaded targets: %j', (weightFields, expected) => {
    const exercise = {
      planned_id: 5, sets: 2, weight: 50, reps: 10,
      performed_sets: [{ set_number: 1, weight: 40, reps: 10 }],
      set_targets: [{ set_number: 2, reps: 12, ...weightFields }],
    };
    expect(resolveSetTarget(exercise, 2)).toMatchObject({ weight: expected, reps: 12 });
    expect(resolveSetTarget(exercise, 2, {
      current_planned_exercise_id: 5, current_set_number: 2,
      next_set_target: { set_number: 2, reps: 12, ...weightFields },
    })).toMatchObject({ weight: expected, reps: 12 });
  });

  it('honors current unloaded target without clearing other inherited metrics', () => {
    const exercise = { planned_id: 5, weight: 50, reps: 10 };
    expect(resolveSetTarget(exercise, 1, {
      current_planned_exercise_id: 5, current_set_number: 1,
      next_set_target: { weight: null, unloaded: true, reps: null },
    })).toMatchObject({ weight: null, reps: 10 });
    expect(resolveSetTarget(exercise, 1, {
      current_planned_exercise_id: 6, current_set_number: 1,
      next_set_target: { weight: null, unloaded: true },
    })).toMatchObject({ weight: 50 });
  });

  it.each([{}, { weight: null }, { weight: null, unloaded: false }, { weight: null, unloaded: true }, { unloaded: true }])('resolves persisted target against global weight: %j', (weightFields) => {
    const exercise = { planned_id: 5, weight: 50, reps: 10, set_targets: [{ set_number: 1, reps: 12, ...weightFields }] };
    const expected = 'unloaded' in weightFields && weightFields.unloaded ? null : 50;
    expect(resolveSetTarget(exercise, 1)?.weight).toBe(expected);
    expect(resolveSetTarget(exercise, 1, {
      current_planned_exercise_id: 5, current_set_number: 1,
      next_set_target: { set_number: 1, ...weightFields },
    })?.weight).toBe(expected);
  });

  it('preserves actual performed null without a target', () => {
    expect(resolveSetTarget({ weight: 50, performed_sets: [{ set_number: 1, weight: null }] }, 2)?.weight).toBeNull();
  });

  it('inherits global weight for reps-only targets and preserves previous no load', () => {
    const exercise = { weight: 50, reps: 10, set_targets: [{ set_number: 2, reps: 12 }] };
    expect(resolveSetTarget(exercise, 2)).toMatchObject({ weight: 50, reps: 12 });
    expect(resolveSetTarget({ ...exercise, performed_sets: [{ set_number: 1, weight: null }] }, 2))
      .toMatchObject({ weight: null, reps: 12 });
  });

  it('selects the first missing set number after deleting a middle set', () => {
    const exercise = { sets: 3, performed_sets: [{ set_number: 1 }, { set_number: 3 }] };
    expect(missingSetNumbers(exercise)).toEqual([2]);
  });

  it('prefers backend current_set_number for a deleted middle set', () => {
    const exercise = { planned_id: 5, sets: 3, performed_sets: [{ set_number: 1 }, { set_number: 3 }] };
    expect(resolveCurrentSetNumber(exercise, { current_planned_exercise_id: 5, current_set_number: 2 })).toBe(2);
  });

  it('resolves next target in order current over per-set over previous over global', () => {
    const exercise = {
      planned_id: 5,
      sets: 3,
      reps: 10,
      weight: 30,
      performed_sets: [
        { set_number: 1, reps: 12, weight: 32.5 },
        { set_number: 3, reps: 8, weight: 35 },
      ],
      set_targets: [{ set_number: 2, reps: 11, weight: 34 }],
    };

    expect(resolveSetTarget(exercise, 2)).toMatchObject({ set_number: 2, reps: 11, weight: 34 });
    expect(resolveSetTarget({ ...exercise, set_targets: [] }, 2)).toMatchObject({ set_number: 2, reps: 12, weight: 32.5 });
    expect(
      resolveSetTarget(exercise, 2, {
        current_planned_exercise_id: 5,
        current_set_number: 2,
        next_set_target: { set_number: 2, reps: 9, weight: 36 },
      }),
    ).toMatchObject({ set_number: 2, reps: 9, weight: 36 });
  });

  it('formats timed target badges with explicit seconds', () => {
    expect(
      formatExerciseTargetBadge({
        sets: 2,
        execution_metric: 'duration_seconds',
        duration_seconds: 40,
      }),
    ).toBe('2×40s');
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
