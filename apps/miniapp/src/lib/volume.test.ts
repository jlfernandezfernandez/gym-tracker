import { describe, expect, it } from 'vitest';
import {
  calculateMuscleLoadSplit,
  calculateWeeklyStreak,
  calculateQuantileThresholds,
  resolveHeatTier,
  getMondayOfWeek,
  toIsoDate,
} from './volume';

describe('calculateMuscleLoadSplit', () => {
  it('strictly excludes warm-up sets (is_warmup: true)', () => {
    const exercises = [
      {
        target: 'quadriceps',
        secondary_muscles: '',
        performed_sets: [
          { set_number: 1, weight: 20, reps: 10, is_warmup: true }, // 200 kg excluded
          { set_number: 2, weight: 50, reps: 10, is_warmup: true }, // 500 kg excluded
          { set_number: 3, weight: 100, reps: 10, is_warmup: false }, // 1000 kg included
          { set_number: 4, weight: 100, reps: 10, is_warmup: false }, // 1000 kg included
        ],
      },
    ];

    const result = calculateMuscleLoadSplit(exercises);
    expect(result.totalLoad).toBe(2000);
    expect(result.muscles.length).toBe(1);
    expect(result.muscles[0].muscle).toBe('quadriceps');
    expect(result.muscles[0].load).toBe(2000);
    expect(result.muscles[0].percentage).toBe(100);
    expect(result.muscles[0].name).toBe('Cuádriceps');
  });

  it('calculates proportional load split between multiple target muscles', () => {
    const exercises = [
      {
        target: 'quadriceps',
        secondary_muscles: '',
        performed_sets: [
          { weight: 100, reps: 10, is_warmup: false }, // 1000 kg -> Quads
        ],
      },
      {
        target: 'chest',
        secondary_muscles: '',
        performed_sets: [
          { weight: 100, reps: 10, is_warmup: false }, // 1000 kg -> Pecho
        ],
      },
    ];

    const result = calculateMuscleLoadSplit(exercises);
    expect(result.totalLoad).toBe(2000);
    expect(result.muscles.length).toBe(2);
    expect(result.muscles[0].percentage).toBe(50);
    expect(result.muscles[1].percentage).toBe(50);
  });

  it('distributes 100% to primary and 40% to secondary target muscles', () => {
    const exercises = [
      {
        target: 'chest',
        secondary_muscles: 'triceps, deltoids',
        performed_sets: [
          { weight: 100, reps: 10, is_warmup: false }, // 1000 kg
        ],
      },
    ];

    // Primary (chest): 1000 kg
    // Secondary (triceps): 400 kg
    // Secondary (deltoids): 400 kg
    // Total load: 1800 kg
    // Chest: 1000 / 1800 = 55.5% -> 56%
    // Triceps: 400 / 1800 = 22.2% -> 22%
    // Deltoids: 400 / 1800 = 22.2% -> 22%

    const result = calculateMuscleLoadSplit(exercises);
    expect(result.totalLoad).toBe(1800);
    expect(result.muscles.length).toBe(3);
    expect(result.muscles[0].muscle).toBe('chest');
    expect(result.muscles[0].load).toBe(1000);
    expect(result.muscles[0].percentage).toBe(56);
    expect(result.muscles[1].load).toBe(400);
    expect(result.muscles[1].percentage).toBe(22);
    expect(result.muscles[2].load).toBe(400);
    expect(result.muscles[2].percentage).toBe(22);
  });

  it('handles timed and cardio exercises correctly (50 kg/min equivalent)', () => {
    const exercises = [
      {
        activity_type: 'cardio',
        target: 'quadriceps',
        performed_sets: [
          { duration_minutes: 20, is_warmup: false }, // 20 * 50 = 1000 kg
        ],
      },
      {
        activity_type: 'timed',
        target: 'abs',
        performed_sets: [
          { duration_seconds: 60, is_warmup: false }, // 1 min * 50 = 50 kg
        ],
      },
    ];

    const result = calculateMuscleLoadSplit(exercises);
    expect(result.totalLoad).toBe(1050);
    expect(result.muscles[0].muscle).toBe('quadriceps');
    expect(result.muscles[0].load).toBe(1000);
    expect(result.muscles[1].muscle).toBe('abs');
    expect(result.muscles[1].load).toBe(50);
  });

  it('returns empty result when no working sets exist', () => {
    const exercises = [
      {
        target: 'quadriceps',
        performed_sets: [
          { weight: 50, reps: 10, is_warmup: true },
        ],
      },
    ];

    const result = calculateMuscleLoadSplit(exercises);
    expect(result.totalLoad).toBe(0);
    expect(result.muscles).toEqual([]);
    expect(result.volumeMap).toEqual({});
  });
});

describe('calculateWeeklyStreak', () => {
  it('returns 0 for empty sessions list', () => {
    const result = calculateWeeklyStreak([], new Date('2026-08-24T12:00:00'));
    expect(result.currentStreak).toBe(0);
    expect(result.maxStreak).toBe(0);
    expect(result.totalWorkouts).toBe(0);
  });

  it('counts streak when current week has workouts', () => {
    // 2026-08-24 is a Monday (Current week)
    // 2026-08-18 is Tuesday of previous week (W-1)
    // 2026-08-11 is Tuesday of 2 weeks ago (W-2)
    const sessions = [
      { session_date: '2026-08-24' },
      { session_date: '2026-08-18' },
      { session_date: '2026-08-11' },
    ];

    const result = calculateWeeklyStreak(sessions, new Date('2026-08-24T12:00:00'));
    expect(result.currentStreak).toBe(3);
    expect(result.maxStreak).toBe(3);
    expect(result.totalWorkouts).toBe(3);
  });

  it('preserves streak when current week has not been trained yet but last week was', () => {
    // Current date: Wednesday 2026-08-26 (Current week W0 has 0 workouts)
    // Last week: 2026-08-18 (W-1) has a workout
    // 2 weeks ago: 2026-08-11 (W-2) has a workout
    const sessions = [
      { session_date: '2026-08-18' },
      { session_date: '2026-08-11' },
    ];

    const result = calculateWeeklyStreak(sessions, new Date('2026-08-26T12:00:00'));
    expect(result.currentStreak).toBe(2);
  });

  it('resets streak to 0 when both current week and last week have no workouts', () => {
    // Current date: 2026-08-24 (W0)
    // Workout was 3 weeks ago (2026-08-04)
    const sessions = [
      { session_date: '2026-08-04' },
    ];

    const result = calculateWeeklyStreak(sessions, new Date('2026-08-24T12:00:00'));
    expect(result.currentStreak).toBe(0);
    expect(result.maxStreak).toBe(1);
    expect(result.totalWorkouts).toBe(1);
  });

  it('calculates historical max streak correctly across gaps', () => {
    const sessions = [
      // Block of 4 consecutive weeks
      { session_date: '2026-01-05' },
      { session_date: '2026-01-12' },
      { session_date: '2026-01-19' },
      { session_date: '2026-01-26' },
      // Gap
      // Block of 2 consecutive weeks
      { session_date: '2026-08-18' },
      { session_date: '2026-08-24' },
    ];

    const result = calculateWeeklyStreak(sessions, new Date('2026-08-24T12:00:00'));
    expect(result.currentStreak).toBe(2);
    expect(result.maxStreak).toBe(4);
    expect(result.totalWorkouts).toBe(6);
  });
});

describe('calculateQuantileThresholds & resolveHeatTier', () => {
  it('computes 25th, 50th, 75th percentiles accurately', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80];
    const [q25, q50, q75] = calculateQuantileThresholds(values);
    expect(q25).toBeGreaterThan(10);
    expect(q50).toBeGreaterThan(q25);
    expect(q75).toBeGreaterThan(q50);
  });

  it('resolves heat tiers from 0 to 4 based on quantile thresholds', () => {
    const thresholds: [number, number, number] = [30, 60, 90];
    expect(resolveHeatTier(0, thresholds)).toBe(0);
    expect(resolveHeatTier(20, thresholds)).toBe(1);
    expect(resolveHeatTier(30, thresholds)).toBe(1);
    expect(resolveHeatTier(45, thresholds)).toBe(2);
    expect(resolveHeatTier(60, thresholds)).toBe(2);
    expect(resolveHeatTier(75, thresholds)).toBe(3);
    expect(resolveHeatTier(90, thresholds)).toBe(3);
    expect(resolveHeatTier(100, thresholds)).toBe(4);
  });

  it('handles identical non-zero values with tier 2', () => {
    const thresholds: [number, number, number] = [45, 45, 45];
    expect(resolveHeatTier(0, thresholds)).toBe(0);
    expect(resolveHeatTier(45, thresholds)).toBe(2);
  });
});
