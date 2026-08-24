/**
 * Volume calculations, muscle load distribution, and streak analytics.
 */
import {
  type CanonicalMuscle,
  CANONICAL_MUSCLES,
  MUSCLE_LABELS_ES,
  normalizeMuscle,
} from './body-paths';

export interface MuscleLoadItem {
  muscle: CanonicalMuscle;
  name: string;
  load: number;
  percentage: number;
  sets: number;
  color?: string;
}

export interface SessionVolumeSplit {
  totalLoad: number;
  totalSets: number;
  muscles: MuscleLoadItem[];
  volumeMap: Record<string, number>;
}

export interface StreakStats {
  currentStreak: number;
  maxStreak: number;
  totalWorkouts: number;
  activeWeeksCount: number;
}

/** Modern accessible color ramp for multi-segment muscle split bars */
export const SPLIT_BAR_COLORS = [
  '#5856d6', // Brand accent purple
  '#30a46c', // Emerald
  '#ff9f0a', // Amber
  '#007aff', // Blue
  '#ff453a', // Coral / Red
  '#af52de', // Violet
  '#5ac8fa', // Sky
  '#ff2d55', // Pink
  '#34c759', // Bright Green
  '#e5a000', // Gold
  '#64d2ff', // Cyan
  '#bf5af2', // Purple-light
];

export function splitMuscles(muscleList?: string | string[] | null): string[] {
  if (!muscleList) return [];
  if (Array.isArray(muscleList)) return muscleList;
  return String(muscleList)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Computes post-workout muscle load split for completed sessions.
 * Strictly excludes warm-up sets (is_warmup: true).
 * Primary target muscles absorb 1.0 (100%) and secondary muscles absorb 0.4 (40%).
 */
export function calculateMuscleLoadSplit(exercises: any[] = []): SessionVolumeSplit {
  const muscleLoadMap = new Map<CanonicalMuscle, { load: number; sets: number }>();
  let totalWorkingSets = 0;

  for (const exercise of exercises) {
    if (!exercise) continue;

    // Resolve primary target muscle
    const rawPrimary = exercise.target || exercise.muscle_group || exercise.body_part || '';
    const primaryMuscle = normalizeMuscle(rawPrimary);

    // Resolve secondary target muscles
    const rawSecondary = splitMuscles(exercise.secondary_muscles);
    const secondaryMuscles = rawSecondary
      .map(normalizeMuscle)
      .filter((m): m is CanonicalMuscle => m !== null && m !== primaryMuscle);

    // If no target resolved at all, skip exercise
    if (!primaryMuscle && secondaryMuscles.length === 0) continue;

    // Filter performed sets — strictly exclude warm-ups
    const performedSets: any[] = exercise.performed_sets || [];
    const workingSets = performedSets.filter((s) => !s?.is_warmup);

    // If no performed sets, fallback to planned sets if available
    const setsToCalculate = workingSets.length > 0
      ? workingSets
      : (exercise.sets > 0 && performedSets.length === 0)
        ? Array.from({ length: exercise.sets }, () => ({
            weight: exercise.weight,
            reps: exercise.reps,
            duration_minutes: exercise.duration_minutes,
            duration_seconds: exercise.duration_seconds,
            is_warmup: false,
          }))
        : [];

    if (setsToCalculate.length === 0) continue;

    let exerciseTonnage = 0;
    const workingCount = setsToCalculate.length;
    totalWorkingSets += workingCount;

    for (const set of setsToCalculate) {
      if (set?.is_warmup) continue;

      if (exercise.activity_type === 'cardio' || exercise.is_cardio) {
        const mins = Number(set.duration_minutes ?? exercise.duration_minutes ?? (set.duration_seconds ? set.duration_seconds / 60 : 0) ?? 0);
        exerciseTonnage += mins * 50; // 50 kg equivalent per cardio minute
      } else if (exercise.activity_type === 'timed' || (set.duration_seconds && !set.weight && !set.reps)) {
        const mins = Number((set.duration_seconds ? set.duration_seconds / 60 : 0) || set.duration_minutes || exercise.duration_minutes || 0);
        exerciseTonnage += mins * 50;
      } else {
        const reps = Number(set.reps ?? exercise.reps ?? 0);
        const weight = set.weight != null ? Number(set.weight) : (exercise.weight != null ? Number(exercise.weight) : null);
        if (weight != null && weight > 0) {
          exerciseTonnage += weight * reps;
        } else if (reps > 0) {
          exerciseTonnage += 75.0 * reps; // standard bodyweight reference load
        }
      }
    }

    if (exerciseTonnage <= 0) continue;

    // Allocate to primary muscle (100% = 1.0)
    if (primaryMuscle) {
      const current = muscleLoadMap.get(primaryMuscle) || { load: 0, sets: 0 };
      muscleLoadMap.set(primaryMuscle, {
        load: current.load + exerciseTonnage * 1.0,
        sets: current.sets + workingCount,
      });
    }

    // Allocate to secondary muscles (40% = 0.4)
    for (const sec of secondaryMuscles) {
      const current = muscleLoadMap.get(sec) || { load: 0, sets: 0 };
      muscleLoadMap.set(sec, {
        load: current.load + exerciseTonnage * 0.4,
        sets: current.sets + workingCount * 0.4,
      });
    }
  }

  const totalLoad = Array.from(muscleLoadMap.values()).reduce((sum, item) => sum + item.load, 0);
  const volumeMap: Record<string, number> = {};

  if (totalLoad <= 0) {
    return {
      totalLoad: 0,
      totalSets: totalWorkingSets,
      muscles: [],
      volumeMap: {},
    };
  }

  // Sort descending by load
  const sortedEntries = Array.from(muscleLoadMap.entries()).sort(
    (a, b) => b[1].load - a[1].load,
  );

  const muscles: MuscleLoadItem[] = sortedEntries.map(([muscle, data], index) => {
    const rawPct = (data.load / totalLoad) * 100;
    volumeMap[muscle] = Math.round(data.load);
    return {
      muscle,
      name: MUSCLE_LABELS_ES[muscle] || muscle,
      load: Math.round(data.load),
      percentage: Math.round(rawPct),
      sets: Math.round(data.sets * 10) / 10,
      color: SPLIT_BAR_COLORS[index % SPLIT_BAR_COLORS.length],
    };
  });

  return {
    totalLoad: Math.round(totalLoad),
    totalSets: totalWorkingSets,
    muscles,
    volumeMap,
  };
}

/**
 * Returns the Monday 00:00 (local) date of the week containing `date`.
 */
export function getMondayOfWeek(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday is 0, Sunday is 6
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Format Date to ISO date string `YYYY-MM-DD`
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes weekly streak stats across session history.
 * A weekly streak counts unbroken consecutive calendar weeks with at least 1 workout.
 * If the current week has 0 workouts yet, streak is not broken provided last week had a workout.
 */
export function calculateWeeklyStreak(
  sessions: Array<{ session_date?: string; status?: string } | any> = [],
  today: Date = new Date(),
): StreakStats {
  if (!sessions || sessions.length === 0) {
    return {
      currentStreak: 0,
      maxStreak: 0,
      totalWorkouts: 0,
      activeWeeksCount: 0,
    };
  }

  // Set of week Monday ISO dates that contain at least one session
  const workoutWeekSet = new Set<string>();
  let totalWorkouts = 0;

  for (const s of sessions) {
    const rawDate = s?.session_date || s?.date;
    if (!rawDate) continue;
    totalWorkouts += 1;
    const monday = getMondayOfWeek(rawDate);
    workoutWeekSet.add(toIsoDate(monday));
  }

  const activeWeeksCount = workoutWeekSet.size;
  if (activeWeeksCount === 0) {
    return {
      currentStreak: 0,
      maxStreak: 0,
      totalWorkouts,
      activeWeeksCount: 0,
    };
  }

  // Current week Monday
  const currentMonday = getMondayOfWeek(today);
  const currentWeekKey = toIsoDate(currentMonday);

  // Check current week
  let streak = 0;
  const cursor = new Date(currentMonday);

  if (workoutWeekSet.has(currentWeekKey)) {
    streak = 1;
    // Walk backwards 1 week at a time
    while (true) {
      cursor.setDate(cursor.getDate() - 7);
      const weekKey = toIsoDate(cursor);
      if (workoutWeekSet.has(weekKey)) {
        streak += 1;
      } else {
        break;
      }
    }
  } else {
    // Current week not yet trained: check last week
    cursor.setDate(cursor.getDate() - 7);
    const lastWeekKey = toIsoDate(cursor);
    if (workoutWeekSet.has(lastWeekKey)) {
      streak = 1;
      while (true) {
        cursor.setDate(cursor.getDate() - 7);
        const weekKey = toIsoDate(cursor);
        if (workoutWeekSet.has(weekKey)) {
          streak += 1;
        } else {
          break;
        }
      }
    } else {
      streak = 0;
    }
  }

  // Calculate max streak across all historical weeks
  const sortedWeeks = Array.from(workoutWeekSet).sort();
  let maxStreak = 0;
  let runningStreak = 0;
  let prevTime: number | null = null;

  for (const weekStr of sortedWeeks) {
    const weekTime = new Date(weekStr + 'T00:00:00').getTime();
    if (prevTime === null) {
      runningStreak = 1;
    } else {
      const diffWeeks = Math.round((weekTime - prevTime) / (7 * 86400000));
      if (diffWeeks === 1) {
        runningStreak += 1;
      } else {
        runningStreak = 1;
      }
    }
    prevTime = weekTime;
    if (runningStreak > maxStreak) {
      maxStreak = runningStreak;
    }
  }

  return {
    currentStreak: streak,
    maxStreak: Math.max(maxStreak, streak),
    totalWorkouts,
    activeWeeksCount,
  };
}

/**
 * Calculates quantile thresholds (q25, q50, q75) and resolves intensity tier 0-4 for daily durations/loads.
 */
export function calculateQuantileThresholds(values: number[]): [number, number, number] {
  const filtered = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (filtered.length === 0) return [0, 0, 0];

  const getPercentile = (p: number) => {
    const idx = (filtered.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return filtered[lower];
    const weight = idx - lower;
    return filtered[lower] * (1 - weight) + filtered[upper] * weight;
  };

  const q25 = getPercentile(0.25);
  const q50 = getPercentile(0.50);
  const q75 = getPercentile(0.75);

  return [q25, q50, q75];
}

/**
 * Resolves shading tier 0 to 4 given a day's value and quantile thresholds.
 */
export function resolveHeatTier(value: number, [q25, q50, q75]: [number, number, number]): number {
  if (!value || value <= 0) return 0;
  if (q25 === q75) {
    // All positive values are identical
    return 2;
  }
  if (value <= q25) return 1;
  if (value <= q50) return 2;
  if (value <= q75) return 3;
  return 4;
}
