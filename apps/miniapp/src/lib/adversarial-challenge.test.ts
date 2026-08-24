import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('./telegram', () => ({
  haptic: () => undefined,
  tg: undefined,
  inTelegram: () => false,
}));
vi.mock('../lib/telegram', () => ({
  haptic: () => undefined,
  tg: undefined,
  inTelegram: () => false,
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock('../app/App', () => ({
  useApp: () => ({ readOnly: false, pop: vi.fn(), replace: vi.fn() }),
  useSession: () => ({ data: null, isLoading: false }),
}));
vi.mock('../lib/wakelock', () => ({
  useWakeLock: vi.fn(),
}));

import {
  CANONICAL_MUSCLES,
  INERT_PARTS,
  MUSCLE_LABELS_ES,
  ANTERIOR_PATHS,
  POSTERIOR_PATHS,
  formatMuscleName,
  normalizeMuscle,
} from './body-paths';
import {
  COLOR_READY,
  COLOR_RECOVERING,
  COLOR_FATIGUED,
  COLOR_BASE_UNSELECTED,
  COLOR_BASE_INERT,
  computeVolumeTier,
  normalizeRecoveryData,
  normalizeVolumeData,
  resolvePartColor,
} from './bodymap';
import {
  calculateMuscleLoadSplit,
  calculateWeeklyStreak,
  calculateQuantileThresholds,
  resolveHeatTier,
  getMondayOfWeek,
  toIsoDate,
} from './volume';
import {
  formatTimerDisplay,
  isTimedOrIsometricExercise,
} from '../features/workout/Exercise';

describe('Adversarial Stress Test: Domain 1 - BodyMap 3 Modes & Edge States', () => {
  it('handles completely null, undefined, empty, and malformed recovery/volume data', () => {
    // Null inputs
    const recMapNull = normalizeRecoveryData(null);
    const volDataNull = normalizeVolumeData(null);

    expect(recMapNull.size).toBe(0);
    expect(volDataNull.map.size).toBe(0);
    expect(volDataNull.max).toBe(0);

    // Empty array or object
    const recMapArray = normalizeRecoveryData([]);
    const recMapObj = normalizeRecoveryData({});
    expect(recMapArray.size).toBe(0);
    expect(recMapObj.size).toBe(0);

    // Malformed items
    const malformed = normalizeRecoveryData([
      null as any,
      undefined as any,
      {} as any,
      { muscle: '' } as any,
      { muscle: 'invalid_alien_muscle', readiness_pct: 50, fatigue_pct: 50, status: 'recovering' },
    ]);
    expect(malformed.size).toBe(0);
  });

  it('correctly resolves fallback for missing muscles in fatigue mode', () => {
    // Only chest has recovery info
    const recMap = normalizeRecoveryData({
      chest: {
        muscle: 'chest',
        readiness_pct: 40,
        fatigue_pct: 60,
        status: 'fatigued',
      },
    });

    // Untrained muscle (quadriceps)
    const quadColor = resolvePartColor({
      partId: 'quadriceps',
      mode: 'fatigue',
      recoveryMap: recMap,
    });
    expect(quadColor.highlighted).toBe(false);
    expect(quadColor.fill).toBe(COLOR_BASE_UNSELECTED);
    expect(quadColor.recovery?.readiness_pct).toBe(100);
    expect(quadColor.recovery?.status).toBe('ready');

    // Trained muscle (chest)
    const chestColor = resolvePartColor({
      partId: 'chest',
      mode: 'fatigue',
      recoveryMap: recMap,
    });
    expect(chestColor.highlighted).toBe(true);
    expect(chestColor.fill).toBe(COLOR_FATIGUED);
    expect(chestColor.recovery?.readiness_pct).toBe(40);
  });

  it('evaluates extreme readiness boundary conditions (0%, 1%, 44%, 45%, 50%, 74%, 75%, 99%, 100%)', () => {
    const testCases: Array<{
      pct: number;
      expectedFill: string;
      expectedStatus: string;
    }> = [
      { pct: 0, expectedFill: COLOR_FATIGUED, expectedStatus: 'fatigued' },
      { pct: 1, expectedFill: COLOR_FATIGUED, expectedStatus: 'fatigued' },
      { pct: 44, expectedFill: COLOR_FATIGUED, expectedStatus: 'fatigued' },
      { pct: 45, expectedFill: COLOR_RECOVERING, expectedStatus: 'recovering' },
      { pct: 50, expectedFill: COLOR_RECOVERING, expectedStatus: 'recovering' },
      { pct: 74, expectedFill: COLOR_RECOVERING, expectedStatus: 'recovering' },
      { pct: 75, expectedFill: COLOR_READY, expectedStatus: 'ready' },
      { pct: 99, expectedFill: COLOR_READY, expectedStatus: 'ready' },
      { pct: 100, expectedFill: COLOR_READY, expectedStatus: 'ready' },
    ];

    for (const { pct, expectedFill } of testCases) {
      const recMap = normalizeRecoveryData({
        biceps: {
          muscle: 'biceps',
          readiness_pct: pct,
          fatigue_pct: 100 - pct,
          status: pct >= 75 ? 'ready' : pct >= 45 ? 'recovering' : 'fatigued',
        },
      });

      const res = resolvePartColor({
        partId: 'biceps',
        mode: 'fatigue',
        recoveryMap: recMap,
      });

      expect(res.fill).toBe(expectedFill);
      expect(res.highlighted).toBe(true);
      expect(res.recovery?.readiness_pct).toBe(pct);
    }
  });

  it('renders all 18 canonical muscles across ANTERIOR and POSTERIOR SVG definitions', () => {
    const anteriorMuscles = new Set(
      ANTERIOR_PATHS.filter((p) => !p.isInert).map((p) => p.id),
    );
    const posteriorMuscles = new Set(
      POSTERIOR_PATHS.filter((p) => !p.isInert).map((p) => p.id),
    );

    const combinedMuscles = new Set([...anteriorMuscles, ...posteriorMuscles]);
    for (const muscle of CANONICAL_MUSCLES) {
      expect(combinedMuscles.has(muscle)).toBe(true);
    }

    // Every path has non-empty points and proper view
    for (const p of [...ANTERIOR_PATHS, ...POSTERIOR_PATHS]) {
      expect(p.points.trim().length).toBeGreaterThan(10);
      expect(p.name).toBeTruthy();
    }
  });

  it('properly preserves inert silhouette status for non-muscle anatomical parts', () => {
    for (const inert of INERT_PARTS) {
      const res = resolvePartColor({
        partId: inert,
        isInert: true,
        mode: 'fatigue',
      });
      expect(res.fill).toBe(COLOR_BASE_INERT);
      expect(res.highlighted).toBe(false);
    }
  });

  it('evaluates Mode 2 (Balance / Volume) volume tier quantization under edge distributions', () => {
    expect(computeVolumeTier(0, 0)).toBe(0);
    expect(computeVolumeTier(-5, 10)).toBe(0);
    expect(computeVolumeTier(1, 0)).toBe(1);
    expect(computeVolumeTier(3, 0)).toBe(2);
    expect(computeVolumeTier(5, 0)).toBe(3);
    expect(computeVolumeTier(8, 0)).toBe(4);
    expect(computeVolumeTier(100, 0)).toBe(4);

    // With dynamic maxValue:
    expect(computeVolumeTier(24, 100)).toBe(1); // < 25% -> 1
    expect(computeVolumeTier(25, 100)).toBe(2); // 25% -> 2
    expect(computeVolumeTier(49, 100)).toBe(2); // < 50% -> 2
    expect(computeVolumeTier(50, 100)).toBe(3); // 50% -> 3
    expect(computeVolumeTier(74, 100)).toBe(3); // < 75% -> 3
    expect(computeVolumeTier(75, 100)).toBe(4); // >= 75% -> 4
    expect(computeVolumeTier(100, 100)).toBe(4);
  });
});

describe('Adversarial Stress Test: Domain 2 - Spanish Alias Normalization & Catalog Filtering', () => {
  const ALIAS_TEST_MATRIX: Record<string, string> = {
    // Spanish with/without accents, plural/singular, mixed cases
    'Pecho': 'chest',
    'pecho': 'chest',
    'PECHO': 'chest',
    'Pectorals': 'chest',
    'Cuádriceps': 'quadriceps',
    'cuádriceps': 'quadriceps',
    'cuadriceps': 'quadriceps',
    'CUADRICEPS': 'quadriceps',
    'quads': 'quadriceps',
    'Bíceps': 'biceps',
    'bíceps': 'biceps',
    'biceps': 'biceps',
    'bicep': 'biceps',
    'Tríceps': 'triceps',
    'tríceps': 'triceps',
    'triceps': 'triceps',
    'tricep': 'triceps',
    'Glúteos': 'gluteal',
    'glúteos': 'gluteal',
    'gluteos': 'gluteal',
    'glutes': 'gluteal',
    'gluteal': 'gluteal',
    'gluteus': 'gluteal',
    'abductores': 'gluteal',
    'Espalda alta': 'upper-back',
    'espalda alta': 'upper-back',
    'espalda': 'upper-back',
    'dorsales': 'upper-back',
    'dorsal': 'upper-back',
    'lats': 'upper-back',
    'latissimus dorsi': 'upper-back',
    'romboides': 'upper-back',
    'rhomboids': 'upper-back',
    'Espalda baja': 'lower-back',
    'espalda baja': 'lower-back',
    'lumbar': 'lower-back',
    'lumbares': 'lower-back',
    'spine': 'lower-back',
    'lower back': 'lower-back',
    'Hombros': 'deltoids',
    'hombros': 'deltoids',
    'delts': 'deltoids',
    'front-deltoids': 'deltoids',
    'rear deltoids': 'deltoids',
    'shoulders': 'deltoids',
    'Trapecio': 'trapezius',
    'trapecio': 'trapezius',
    'traps': 'trapezius',
    'levator scapulae': 'trapezius',
    'abs': 'abs',
    'abdominals': 'abs',
    'core': 'abs',
    'abdomen': 'abs',
    'waist': 'abs',
    'Oblicuos': 'obliques',
    'oblicuos': 'obliques',
    'obliques': 'obliques',
    'Serrato': 'serratus',
    'serrato': 'serratus',
    'serratus': 'serratus',
    'serratus anterior': 'serratus',
    'Antebrazos': 'forearm',
    'antebrazos': 'forearm',
    'forearms': 'forearm',
    'forearm': 'forearm',
    'wrists': 'forearm',
    'wrist flexors': 'forearm',
    'grip muscles': 'forearm',
    'Isquiotibiales': 'hamstring',
    'isquiotibiales': 'hamstring',
    'isquios': 'hamstring',
    'hamstrings': 'hamstring',
    'hamstring': 'hamstring',
    'Aductores': 'adductors',
    'aductores': 'adductors',
    'adductors': 'adductors',
    'groin': 'adductors',
    'inner thighs': 'adductors',
    'Flexores de cadera': 'hip-flexors',
    'flexores de cadera': 'hip-flexors',
    'hip flexors': 'hip-flexors',
    'Gemelos': 'calves',
    'gemelos': 'calves',
    'calves': 'calves',
    'calf': 'calves',
    'soleus': 'calves',
    'Tibiales': 'tibialis',
    'tibiales': 'tibialis',
    'tibialis': 'tibialis',
    'shins': 'tibialis',
  };

  it('normalizes extensive Spanish & English taxonomy matrix without failures', () => {
    for (const [raw, expectedCanonical] of Object.entries(ALIAS_TEST_MATRIX)) {
      const normalized = normalizeMuscle(raw);
      expect(
        normalized,
        `Expected "${raw}" to normalize to "${expectedCanonical}", got "${normalized}"`,
      ).toBe(expectedCanonical);
    }
  });

  it('handles extreme diacritic permutations and whitespace trimming', () => {
    expect(normalizeMuscle('   cuádriceps   ')).toBe('quadriceps');
    expect(normalizeMuscle('  BÍCEPS \n')).toBe('biceps');
    expect(normalizeMuscle('\tGLÚTEOS\t')).toBe('gluteal');
  });

  it('formats all 18 canonical muscles to Spanish names accurately', () => {
    for (const slug of CANONICAL_MUSCLES) {
      const spanishName = formatMuscleName(slug);
      expect(spanishName).toBeTruthy();
      expect(spanishName).toBe(MUSCLE_LABELS_ES[slug]);
    }
  });
});

describe('Adversarial Stress Test: Domain 3 - Timed & Isometric Stopwatch Calculations', () => {
  it('correctly formats extreme timer duration displays', () => {
    expect(formatTimerDisplay(0)).toBe('00:00');
    expect(formatTimerDisplay(-100)).toBe('00:00');
    expect(formatTimerDisplay(0.999)).toBe('00:00');
    expect(formatTimerDisplay(59)).toBe('00:59');
    expect(formatTimerDisplay(60)).toBe('01:00');
    expect(formatTimerDisplay(3599)).toBe('59:59');
    expect(formatTimerDisplay(3600)).toBe('60:00');
    expect(formatTimerDisplay(7265)).toBe('121:05');
  });

  it('detects timed/isometric across various syntax, notes, and activity types', () => {
    const isometrics = [
      { name: 'Plank' },
      { name: 'Plancha lateral' },
      { name: 'Dead Hang con agarre prono' },
      { name: 'Colgado en barra pasivo' },
      { name: 'Wall sit apoyado en pared' },
      { name: 'Sentadilla isométrica a 90 grados' },
      { name: 'Paseo del granjero con mancuernas pesadas' },
      { name: 'Farmer carry unilateral' },
      { name: 'Hollow body hold' },
      { name: 'L-sit en anillas' },
      { name: 'V-sit hold' },
      { name: 'Flexiones', notes: 'Aguantar abajo 3s en isometría' },
      { activity_type: 'isometric' },
      { activity_type: 'timed' },
      { is_isometric: true },
      { is_timed: true },
      { mode: 'time' },
    ];

    for (const ex of isometrics) {
      expect(
        isTimedOrIsometricExercise(ex),
        `Expected exercise ${JSON.stringify(ex)} to be detected as timed/isometric`,
      ).toBe(true);
    }
  });

  it('rejects dynamic and cardio exercises from isometric timer detection', () => {
    const dynamics = [
      { name: 'Press militar con barra', activity_type: 'strength' },
      { name: 'Curl de bíceps con mancuerna', activity_type: 'strength' },
      { name: 'Remo con barra', activity_type: 'strength' },
      { name: 'Sentadilla búlgara', activity_type: 'strength' },
      { name: 'Press banca plano', activity_type: 'strength' },
      { name: 'Carrera continua', activity_type: 'cardio' },
      { name: 'Cinta elíptica', activity_type: 'cardio' },
      null,
      undefined,
      {},
    ];

    for (const ex of dynamics) {
      expect(isTimedOrIsometricExercise(ex)).toBe(false);
    }
  });
});

describe('Adversarial Stress Test: Domain 4 - Heatmap Quantiles, Streaks & Light/Dark Theme', () => {
  it('handles empty, single, and identical array quantile calculations', () => {
    expect(calculateQuantileThresholds([])).toEqual([0, 0, 0]);
    expect(calculateQuantileThresholds([50])).toEqual([50, 50, 50]);

    const identical = [40, 40, 40, 40, 40];
    expect(calculateQuantileThresholds(identical)).toEqual([40, 40, 40]);
    expect(resolveHeatTier(40, [40, 40, 40])).toBe(2);
    expect(resolveHeatTier(0, [40, 40, 40])).toBe(0);
  });

  it('accurately resolves heat tiers across wide quantile spreads', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const quantiles = calculateQuantileThresholds(values);
    // q25 ≈ 32.5, q50 = 55, q75 ≈ 77.5
    expect(resolveHeatTier(0, quantiles)).toBe(0);
    expect(resolveHeatTier(15, quantiles)).toBe(1);
    expect(resolveHeatTier(45, quantiles)).toBe(2);
    expect(resolveHeatTier(70, quantiles)).toBe(3);
    expect(resolveHeatTier(95, quantiles)).toBe(4);
  });

  it('handles Sunday / Monday boundary math correctly in getMondayOfWeek', () => {
    // 2026-08-24 is a Monday
    const mon = getMondayOfWeek(new Date('2026-08-24T15:30:00'));
    expect(toIsoDate(mon)).toBe('2026-08-24');

    // 2026-08-30 is Sunday of the same week
    const sun = getMondayOfWeek(new Date('2026-08-30T23:59:59'));
    expect(toIsoDate(sun)).toBe('2026-08-24');

    // 2026-08-31 is the following Monday
    const nextMon = getMondayOfWeek(new Date('2026-08-31T08:00:00'));
    expect(toIsoDate(nextMon)).toBe('2026-08-31');
  });

  it('handles forgiving active week streak logic (current week untrained vs trained)', () => {
    // Fixed reference date: Wednesday 2026-08-26 (Week 2026-08-24 has 0 workouts)
    const wednesday = new Date('2026-08-26T12:00:00');

    // Scenario A: Trained last 3 previous weeks, 0 this week yet -> streak = 3 (Forgiving)
    const sessionsA = [
      { session_date: '2026-08-18' }, // W-1
      { session_date: '2026-08-11' }, // W-2
      { session_date: '2026-08-04' }, // W-3
    ];
    const streakA = calculateWeeklyStreak(sessionsA, wednesday);
    expect(streakA.currentStreak).toBe(3);
    expect(streakA.maxStreak).toBe(3);
    expect(streakA.activeWeeksCount).toBe(3);

    // Scenario B: Trained this week on Monday -> streak = 4
    const sessionsB = [
      { session_date: '2026-08-24' }, // W0 (Current)
      ...sessionsA,
    ];
    const streakB = calculateWeeklyStreak(sessionsB, wednesday);
    expect(streakB.currentStreak).toBe(4);

    // Scenario C: Neither current week nor last week trained (2 week gap) -> streak = 0
    const sessionsC = [
      { session_date: '2026-08-11' }, // W-2
      { session_date: '2026-08-04' }, // W-3
    ];
    const streakC = calculateWeeklyStreak(sessionsC, wednesday);
    expect(streakC.currentStreak).toBe(0);
    expect(streakC.maxStreak).toBe(2);
  });

  it('aggregates multiple sessions within the same week without inflating streak count', () => {
    // 5 sessions in the same week (2026-08-24 to 2026-08-28)
    const sessions = [
      { session_date: '2026-08-24' },
      { session_date: '2026-08-25' },
      { session_date: '2026-08-26' },
      { session_date: '2026-08-27' },
      { session_date: '2026-08-28' },
    ];
    const streak = calculateWeeklyStreak(sessions, new Date('2026-08-28T12:00:00'));
    expect(streak.currentStreak).toBe(1);
    expect(streak.totalWorkouts).toBe(5);
    expect(streak.activeWeeksCount).toBe(1);
  });
});

describe('Adversarial Stress Test: Domain 5 - Muscle Load Split & Warmup Exclusions', () => {
  it('strictly excludes warm-up sets (is_warmup: true) under mixed and boundary conditions', () => {
    const exercises = [
      {
        target: 'chest',
        secondary_muscles: '',
        performed_sets: [
          { set_number: 1, weight: 20, reps: 15, is_warmup: true },  // 300 kg (warmup)
          { set_number: 2, weight: 40, reps: 10, is_warmup: true },  // 400 kg (warmup)
          { set_number: 3, weight: 60, reps: 5, is_warmup: true },   // 300 kg (warmup)
          { set_number: 4, weight: 100, reps: 8, is_warmup: false }, // 800 kg (working)
          { set_number: 5, weight: 100, reps: 8, is_warmup: false }, // 800 kg (working)
          { set_number: 6, weight: 100, reps: 8, is_warmup: false }, // 800 kg (working)
        ],
      },
    ];

    const result = calculateMuscleLoadSplit(exercises);
    // Warmup total: 1000 kg (must be 0 in result)
    // Working total: 2400 kg
    expect(result.totalLoad).toBe(2400);
    expect(result.totalSets).toBe(3);
    expect(result.muscles.length).toBe(1);
    expect(result.muscles[0].muscle).toBe('chest');
    expect(result.muscles[0].load).toBe(2400);
    expect(result.muscles[0].percentage).toBe(100);
    expect(result.muscles[0].sets).toBe(3);
  });

  it('handles 100% warm-up sets session by returning 0 totalLoad and empty muscles', () => {
    const allWarmupSession = [
      {
        target: 'quadriceps',
        performed_sets: [
          { weight: 20, reps: 10, is_warmup: true },
          { weight: 40, reps: 8, is_warmup: true },
        ],
      },
      {
        target: 'chest',
        performed_sets: [
          { weight: 20, reps: 10, is_warmup: true },
        ],
      },
    ];

    const res = calculateMuscleLoadSplit(allWarmupSession);
    expect(res.totalLoad).toBe(0);
    expect(res.muscles).toEqual([]);
    expect(res.volumeMap).toEqual({});
  });

  it('allocates exact 100% primary and 40% secondary distribution with multiple secondary muscles', () => {
    const exercises = [
      {
        target: 'upper-back', // Primary: 1000 kg
        secondary_muscles: 'biceps, forearm, deltoids', // Secondary: 400 kg each
        performed_sets: [
          { weight: 100, reps: 10, is_warmup: false }, // 1000 kg
        ],
      },
    ];

    const res = calculateMuscleLoadSplit(exercises);
    // Total load = 1000 + 400 + 400 + 400 = 2200 kg
    // Upper-back: 1000 / 2200 = 45.45% -> 45%
    // Biceps: 400 / 2200 = 18.18% -> 18%
    // Forearm: 400 / 2200 = 18.18% -> 18%
    // Deltoids: 400 / 2200 = 18.18% -> 18%
    expect(res.totalLoad).toBe(2200);
    expect(res.muscles.length).toBe(4);

    const ub = res.muscles.find((m) => m.muscle === 'upper-back');
    expect(ub?.load).toBe(1000);
    expect(ub?.percentage).toBe(45);

    const bi = res.muscles.find((m) => m.muscle === 'biceps');
    expect(bi?.load).toBe(400);
    expect(bi?.percentage).toBe(18);

    const fa = res.muscles.find((m) => m.muscle === 'forearm');
    expect(fa?.load).toBe(400);
    expect(fa?.percentage).toBe(18);

    const de = res.muscles.find((m) => m.muscle === 'deltoids');
    expect(de?.load).toBe(400);
    expect(de?.percentage).toBe(18);
  });

  it('deduplicates secondary muscle if it matches primary target muscle', () => {
    const exercise = [
      {
        target: 'chest',
        secondary_muscles: 'chest, triceps, Pecho', // Duplicate chest and Spanish alias
        performed_sets: [
          { weight: 100, reps: 10, is_warmup: false }, // 1000 kg
        ],
      },
    ];

    const res = calculateMuscleLoadSplit(exercise);
    // Primary: chest (1000 kg)
    // Secondary: triceps (400 kg) (chest filtered out from secondary)
    // Total: 1400 kg
    expect(res.totalLoad).toBe(1400);
    expect(res.muscles.length).toBe(2);
    expect(res.muscles[0].muscle).toBe('chest');
    expect(res.muscles[0].load).toBe(1000);
    expect(res.muscles[1].muscle).toBe('triceps');
    expect(res.muscles[1].load).toBe(400);
  });
});
