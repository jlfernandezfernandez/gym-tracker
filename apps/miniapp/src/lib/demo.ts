import { resolveSetTarget } from './helpers';

const MEDIA = 'https://jlfernandezfernandez.github.io/gym-tracker/media';

type ExecutionMetric = 'reps' | 'duration_minutes' | 'duration_seconds';

interface CatalogExercise {
  id: number;
  external_id: string;
  name: string;
  name_en: string;
  name_es: string;
  muscle_group: string;
  secondary_muscles: string;
  target: string;
  body_part: string;
  equipment: string;
  activity_type: 'strength' | 'cardio';
  instructions: string;
  instructions_es: string;
  image_url?: string;
  gif_url?: string;
}

interface DemoSetTarget {
  set_number: number;
  weight?: number | null;
  unloaded?: boolean;
  reps: number | null;
  duration_minutes: number | null;
  duration_seconds: number | null;
  is_warmup?: boolean;
}

interface DemoPerformedSet extends DemoSetTarget {
  id: number;
  weight: number | null;
  activity_type: 'strength' | 'cardio';
  weight_mode: 'weighted' | 'bodyweight' | 'unloaded' | null;
  rpe?: number | null;
  rir?: number | null;
  sensation?: string;
  notes?: string;
  pending?: boolean;
  timestamp: string;
}

interface DemoPlannedExercise {
  id: number;
  exercise_id: number;
  order: number;
  target_sets: number;
  target_reps: number | null;
  target_duration_minutes: number | null;
  target_duration_seconds: number | null;
  suggested_weight: number | null;
  execution_metric: ExecutionMetric;
  activity_type: 'strength' | 'cardio';
  weight_mode: 'weighted' | 'bodyweight' | 'unloaded' | null;
  unilateral: boolean;
  superset_group?: string | null;
  notes: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  set_targets: DemoSetTarget[];
  exercise: CatalogExercise;
  performed_sets: DemoPerformedSet[];
}

interface DemoSession {
  id: number;
  session_date: string;
  title: string;
  goal: string;
  status: 'planned' | 'in_progress' | 'completed';
  energy: number;
  discomfort: string;
  duration_estimated: number;
  duration_actual: number;
  feedback: string;
  coach_summary: string;
  share_token: string;
  total_volume: number;
  planned_exercises: DemoPlannedExercise[];
}

interface DemoProfile {
  id: number;
  name: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: string;
  experience_level: string;
  preferred_exercises: string;
  notes: string;
  onboarding_complete: boolean;
  updated_at: string;
}

interface DemoMeasurement {
  id: number;
  measured_at: string;
  source: string;
  weight_kg?: number;
  muscle_kg?: number;
  fat_kg?: number;
  body_fat_pct?: number;
  visceral_fat?: number;
  notes?: string;
}

interface DemoState {
  exercises: CatalogExercise[];
  sessions: DemoSession[];
  profile: DemoProfile;
  measurements: DemoMeasurement[];
  dislikedExerciseIds: number[];
  nextSessionId: number;
  nextPlannedExerciseId: number;
  nextSetId: number;
  nextMeasurementId: number;
}

const clone = <T>(value: T): T =>
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const performedAt = (daysAgo: number, hour = 18, minute = 30) =>
  `${isoDaysAgo(daysAgo)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

const exercises: CatalogExercise[] = [
  {
    id: 101,
    external_id: '0025',
    name: 'Press banca',
    name_en: 'Barbell bench press',
    name_es: 'Press banca',
    muscle_group: 'pectorals',
    secondary_muscles: 'triceps, delts',
    target: 'pectorals',
    body_part: 'chest',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Lower the bar with control and press it away.',
    instructions_es: 'Apoya los pies, retrae las escápulas y baja la barra con control hasta el pecho.',
    image_url: `${MEDIA}/0025-EIeI8Vf.gif`,
    gif_url: `${MEDIA}/0025-EIeI8Vf.gif`,
  },
  {
    id: 102,
    external_id: '0861',
    name: 'Remo en polea',
    name_en: 'Seated cable row',
    name_es: 'Remo en polea',
    muscle_group: 'back',
    secondary_muscles: 'biceps',
    target: 'lats',
    body_part: 'back',
    equipment: 'cable',
    activity_type: 'strength',
    instructions: 'Pull the handle toward your torso without leaning back.',
    instructions_es: 'Mantén el torso estable y lleva el agarre hacia el abdomen juntando las escápulas.',
    image_url: `${MEDIA}/0861-fUBheHs.gif`,
    gif_url: `${MEDIA}/0861-fUBheHs.gif`,
  },
  {
    id: 103,
    external_id: '0043',
    name: 'Sentadilla con barra',
    name_en: 'Barbell squat',
    name_es: 'Sentadilla con barra',
    muscle_group: 'quads',
    secondary_muscles: 'glutes, hamstrings',
    target: 'quads',
    body_part: 'upper legs',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Brace, sit down between your hips and stand tall.',
    instructions_es: 'Bloquea el tronco, baja entre las caderas y empuja el suelo al subir.',
    image_url: `${MEDIA}/0043-qXTaZnJ.gif`,
    gif_url: `${MEDIA}/0043-qXTaZnJ.gif`,
  },
  {
    id: 104,
    external_id: '1457',
    name: 'Press militar',
    name_en: 'Shoulder press',
    name_es: 'Press militar',
    muscle_group: 'delts',
    secondary_muscles: 'triceps',
    target: 'delts',
    body_part: 'shoulders',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Press overhead while keeping your ribs down.',
    instructions_es: 'Mantén el abdomen firme y empuja la barra sobre la cabeza sin arquear la espalda.',
    image_url: `${MEDIA}/1457-Kyd9Rz5.gif`,
    gif_url: `${MEDIA}/1457-Kyd9Rz5.gif`,
  },
  {
    id: 105,
    external_id: '0032',
    name: 'Peso muerto',
    name_en: 'Barbell deadlift',
    name_es: 'Peso muerto',
    muscle_group: 'glutes',
    secondary_muscles: 'hamstrings, back',
    target: 'glutes',
    body_part: 'upper legs',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Push the floor away and keep the bar close.',
    instructions_es: 'Mantén la barra cerca del cuerpo y extiende cadera y rodillas a la vez.',
    image_url: `${MEDIA}/0032-ila4NZS.gif`,
    gif_url: `${MEDIA}/0032-ila4NZS.gif`,
  },
  {
    id: 106,
    external_id: '0031',
    name: 'Curl con barra',
    name_en: 'Barbell curl',
    name_es: 'Curl con barra',
    muscle_group: 'biceps',
    secondary_muscles: 'forearms',
    target: 'biceps',
    body_part: 'upper arms',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Curl without swinging your torso.',
    instructions_es: 'Mantén los codos cerca del cuerpo y sube la barra sin balancear el torso.',
    image_url: `${MEDIA}/0031-25GPyDY.gif`,
    gif_url: `${MEDIA}/0031-25GPyDY.gif`,
  },
  {
    id: 107,
    external_id: 'cardio-row-demo',
    name: 'Remo ergómetro',
    name_en: 'Rowing machine',
    name_es: 'Remo ergómetro',
    muscle_group: 'back',
    secondary_muscles: 'legs, biceps',
    target: 'back',
    body_part: 'cardio',
    equipment: 'cardio',
    activity_type: 'cardio',
    instructions: 'Keep the stroke smooth and sustainable.',
    instructions_es: 'Mantén una cadencia estable y una técnica fluida en cada palada.',
  },
  {
    id: 108,
    external_id: 'timed-hold-demo',
    name: 'Aguante por encima de la cabeza',
    name_en: 'Overhead hold',
    name_es: 'Aguante por encima de la cabeza',
    muscle_group: 'delts',
    secondary_muscles: 'core, triceps',
    target: 'delts',
    body_part: 'shoulders',
    equipment: 'barbell',
    activity_type: 'strength',
    instructions: 'Lock the ribcage down and hold the load stable overhead.',
    instructions_es: 'Bloquea el tronco y mantén la barra estable por encima de la cabeza durante todo el tiempo.',
    image_url: `${MEDIA}/1457-Kyd9Rz5.gif`,
    gif_url: `${MEDIA}/1457-Kyd9Rz5.gif`,
  },
];

const performedStrength = (id: number, setNumber: number, weight: number, reps: number, daysAgo = 0): DemoPerformedSet => ({
  id,
  set_number: setNumber,
  weight,
  activity_type: 'strength',
  weight_mode: 'weighted',
  reps,
  duration_minutes: null,
  duration_seconds: null,
  rpe: 8,
  sensation: 'ok',
  notes: '',
  timestamp: performedAt(daysAgo),
});

const performedTimed = (id: number, setNumber: number, weight: number | null, durationSeconds: number, daysAgo = 0): DemoPerformedSet => ({
  id,
  set_number: setNumber,
  weight,
  activity_type: 'strength',
  weight_mode: weight == null ? 'bodyweight' : 'weighted',
  reps: null,
  duration_minutes: null,
  duration_seconds: durationSeconds,
  rpe: 8,
  sensation: 'ok',
  notes: '',
  timestamp: performedAt(daysAgo),
});

const performedCardio = (id: number, setNumber: number, durationMinutes: number, daysAgo = 0): DemoPerformedSet => ({
  id,
  set_number: setNumber,
  weight: null,
  activity_type: 'cardio',
  weight_mode: null,
  reps: null,
  duration_minutes: durationMinutes,
  duration_seconds: null,
  rpe: 7,
  sensation: 'steady',
  notes: '',
  timestamp: performedAt(daysAgo),
});

const buildSetTargets = (
  targetSets: number,
  executionMetric: ExecutionMetric,
  weight: number | null,
  value: number | null,
): DemoSetTarget[] =>
  Array.from({ length: targetSets }, (_, index) => ({
    set_number: index + 1,
    weight,
    reps: executionMetric === 'reps' ? value : null,
    duration_minutes: executionMetric === 'duration_minutes' ? value : null,
    duration_seconds: executionMetric === 'duration_seconds' ? value : null,
    is_warmup: false,
  }));

const planned = (
  id: number,
  exerciseId: number,
  order: number,
  weight: number | null,
  value: number | null,
  status: DemoPlannedExercise['status'],
  executionMetric: ExecutionMetric = 'reps',
  sets: DemoPerformedSet[] = [],
  targetSets = 3,
) : DemoPlannedExercise => {
  const exercise = exercises.find((item) => item.id === exerciseId);
  if (!exercise) {
    throw new Error(`Ejercicio demo no encontrado: ${exerciseId}`);
  }
  return ({
  id,
  exercise_id: exerciseId,
  order,
  target_sets: targetSets,
  target_reps: executionMetric === 'reps' ? value : null,
  target_duration_minutes: executionMetric === 'duration_minutes' ? value : null,
  target_duration_seconds: executionMetric === 'duration_seconds' ? value : null,
  suggested_weight: weight,
  execution_metric: executionMetric,
  activity_type: exercise.activity_type,
  weight_mode:
    executionMetric === 'duration_minutes'
      ? null
      : weight == null
        ? 'bodyweight'
        : 'weighted',
  unilateral: false,
  notes: '',
  status,
  set_targets: buildSetTargets(targetSets, executionMetric, weight, value),
  exercise,
  performed_sets: sets,
  });
};

const completedSession = (
  id: number,
  daysAgo: number,
  title: string,
  specs: Array<{ exerciseId: number; weight: number | null; value: number; executionMetric?: ExecutionMetric; targetSets?: number }>,
) : DemoSession => ({
  id,
  session_date: isoDaysAgo(daysAgo),
  title,
  goal: 'Progresar manteniendo buena técnica',
  status: 'completed',
  energy: 7,
  discomfort: '',
  duration_estimated: 45,
  duration_actual: 47,
  feedback: 'Buenas sensaciones y cargas controladas.',
  coach_summary: 'Volumen completado según lo previsto.',
  share_token: `demo-${id}`,
  total_volume: 0,
  planned_exercises: specs.map((spec, index) =>
    planned(
      id * 10 + index,
      spec.exerciseId,
      index,
      spec.weight,
      spec.value,
      'completed',
      spec.executionMetric || 'reps',
      Array.from({ length: spec.targetSets || 3 }, (_, setIndex) => {
        const setNumber = setIndex + 1;
        const setId = id * 100 + index * 10 + setNumber;
        if ((spec.executionMetric || 'reps') === 'duration_minutes') {
          return performedCardio(setId, setNumber, spec.value, daysAgo);
        }
        if ((spec.executionMetric || 'reps') === 'duration_seconds') {
          return performedTimed(setId, setNumber, spec.weight, spec.value, daysAgo);
        }
        return performedStrength(setId, setNumber, spec.weight || 0, spec.value, daysAgo);
      }),
      spec.targetSets || 3,
    ),
  ),
});

const completedSessions = [
  completedSession(901, 3, 'Pierna · Base', [
    { exerciseId: 103, weight: 85, value: 8 },
    { exerciseId: 105, weight: 90, value: 6 },
  ]),
  completedSession(902, 7, 'Torso · Volumen', [
    { exerciseId: 101, weight: 67.5, value: 10 },
    { exerciseId: 102, weight: 60, value: 10 },
    { exerciseId: 108, weight: 25, value: 35, executionMetric: 'duration_seconds' },
  ]),
  completedSession(903, 12, 'Full body', [
    { exerciseId: 103, weight: 80, value: 10 },
    { exerciseId: 101, weight: 65, value: 10 },
    { exerciseId: 107, weight: null, value: 14, executionMetric: 'duration_minutes', targetSets: 1 },
  ]),
  completedSession(904, 18, 'Torso · Técnica', [
    { exerciseId: 101, weight: 62.5, value: 10 },
    { exerciseId: 102, weight: 55, value: 12 },
  ]),
];

const sessionSummary = (session: any) => ({
  id: session.id,
  session_date: session.session_date,
  title: session.title,
  status: session.status,
  energy: session.energy,
  duration_actual: session.duration_actual,
  exercise_count: session.planned_exercises.length,
  total_sets: session.planned_exercises.reduce((total: number, exercise: any) => total + exercise.performed_sets.length, 0),
});

const profile: DemoProfile = {
  id: 1,
  name: 'Álex',
  age: 31,
  height_cm: 178,
  weight_kg: 76.4,
  goal: 'Hipertrofia',
  experience_level: 'Intermedio',
  preferred_exercises: 'Press banca, remo en polea y sentadilla',
  notes: 'Datos ficticios preparados para recorrer la demo pública.',
  onboarding_complete: true,
  updated_at: `${isoDaysAgo(0)}T08:00:00`,
};

const measurements: DemoMeasurement[] = [0, 7, 14, 21, 28].map((daysAgo, index) => ({
  id: index + 1,
  measured_at: `${isoDaysAgo(daysAgo)}T08:00:00`,
  source: 'demo',
  weight_kg: 76.4 - index * 0.3,
  muscle_kg: 35.6 - index * 0.2,
  fat_kg: 12.3 + index * 0.15,
  body_fat_pct: 16.3 + index * 0.2,
  visceral_fat: 7,
  notes: '',
}));

function setMetricValue(target: DemoSetTarget | DemoPerformedSet, executionMetric: ExecutionMetric, value: number | null) {
  target.reps = executionMetric === 'reps' ? value : null;
  target.duration_minutes = executionMetric === 'duration_minutes' ? value : null;
  target.duration_seconds = executionMetric === 'duration_seconds' ? value : null;
}

function createDemoState(): DemoState {
  const activeSession: DemoSession = {
    id: 900,
    session_date: isoDaysAgo(0),
    title: 'Torso · Mixto',
    goal: 'Resolver la siguiente decisión sin perder el contexto del día.',
    status: 'in_progress',
    energy: 7,
    discomfort: '',
    duration_estimated: 50,
    duration_actual: 0,
    feedback: '',
    coach_summary: 'Fuerza, un bloque isométrico y un cierre de cardio suave.',
    share_token: 'demo',
    total_volume: 0,
    planned_exercises: [
      planned(9001, 101, 0, 70, 8, 'in_progress', 'reps', [
        performedStrength(90001, 1, 70, 8),
        performedStrength(90002, 2, 70, 8),
      ]),
      planned(9002, 102, 1, 62.5, 10, 'pending'),
      planned(9003, 108, 2, 25, 35, 'pending', 'duration_seconds'),
      planned(9004, 107, 3, null, 12, 'pending', 'duration_minutes', [], 1),
    ],
  };

  return {
    exercises: clone(exercises),
    sessions: [activeSession, ...clone(completedSessions)],
    profile: clone(profile),
    measurements: clone(measurements),
    dislikedExerciseIds: [],
    nextSessionId: 1000,
    nextPlannedExerciseId: 10000,
    nextSetId: 100000,
    nextMeasurementId: measurements.length + 1,
  };
}

let state = createDemoState();

function resetDemoState() {
  state = createDemoState();
}

function asMetric(exercise: DemoPlannedExercise): ExecutionMetric {
  return exercise.execution_metric || (exercise.activity_type === 'cardio' ? 'duration_minutes' : 'reps');
}

function effectiveWeightMode(exercise: DemoPlannedExercise) {
  if (exercise.activity_type === 'cardio') return null;
  if (exercise.suggested_weight == null) return 'bodyweight';
  return exercise.weight_mode || 'weighted';
}

function demoError(status: number, detail: string) {
  return Object.assign(new Error(detail), { status, detail });
}

function mutateDemo<T>(action: (draft: DemoState) => T): T {
  const draft = clone(state);
  const result = action(draft);
  state = draft;
  return clone(result);
}

function performedSetNumbers(exercise: DemoPlannedExercise) {
  return new Set(exercise.performed_sets.map((set) => set.set_number));
}

function hasAllTargetSets(exercise: DemoPlannedExercise) {
  const expected = new Set(Array.from({ length: exercise.target_sets }, (_, index) => index + 1));
  const performed = performedSetNumbers(exercise);
  return expected.size === performed.size && Array.from(expected).every((setNumber) => performed.has(setNumber));
}

function nextMissingSetNumber(exercise: DemoPlannedExercise) {
  const performed = performedSetNumbers(exercise);
  return Array.from({ length: exercise.target_sets }, (_, index) => index + 1).find((setNumber) => !performed.has(setNumber)) || null;
}

function metricField(executionMetric: ExecutionMetric) {
  if (executionMetric === 'duration_minutes') return 'duration_minutes';
  if (executionMetric === 'duration_seconds') return 'duration_seconds';
  return 'reps';
}

function validateDemoMetrics(
  activityType: DemoPlannedExercise['activity_type'] | CatalogExercise['activity_type'],
  {
    executionMetric,
    reps,
    durationMinutes,
    durationSeconds,
    weight,
    unilateral = false,
    requireCardioDuration = true,
  }: {
    executionMetric: ExecutionMetric;
    reps: number | null | undefined;
    durationMinutes: number | null | undefined;
    durationSeconds: number | null | undefined;
    weight: number | null | undefined;
    unilateral?: boolean;
    requireCardioDuration?: boolean;
  },
) {
  if (activityType === 'cardio') {
    if (
      executionMetric !== 'duration_minutes'
      || reps != null
      || durationSeconds != null
      || weight != null
      || unilateral
      || (requireCardioDuration && durationMinutes == null)
    ) {
      throw demoError(422, 'Cardio requires duration_minutes and does not accept reps, weight, duration_seconds or unilateral execution');
    }
    return;
  }
  if (executionMetric === 'duration_minutes') {
    throw demoError(422, 'Strength does not accept duration_minutes; use reps or duration_seconds');
  }
  if (executionMetric === 'duration_seconds') {
    if (durationSeconds == null || reps != null || durationMinutes != null) {
      throw demoError(422, 'Timed strength requires duration_seconds and does not accept reps or duration_minutes');
    }
    return;
  }
  if (reps == null || durationMinutes != null || durationSeconds != null) {
    throw demoError(422, 'Strength requires reps and does not accept duration_minutes or duration_seconds');
  }
}

function validateDemoSetTargets(executionMetric: ExecutionMetric, setTargets: Array<Record<string, any>> | undefined) {
  if (!setTargets) return;
  const seen = new Set<number>();
  for (const target of setTargets) {
    const setNumber = Number(target.set_number);
    if (seen.has(setNumber)) throw demoError(422, 'set_targets contains duplicate set_number values');
    seen.add(setNumber);
    const metricCount = Number(target.reps != null) + Number(target.duration_minutes != null) + Number(target.duration_seconds != null);
    if (metricCount !== 1) {
      throw demoError(422, 'exactly one of reps, duration_minutes or duration_seconds is required');
    }
    if (target[metricField(executionMetric)] == null) {
      throw demoError(422, `set_targets must use execution_metric '${executionMetric}'`);
    }
    if (target.unloaded === true && target.weight != null) {
      throw demoError(422, 'unloaded requires null or omitted weight');
    }
    if (target.unloaded === true && executionMetric === 'duration_minutes') {
      throw demoError(422, 'Cardio does not accept unloaded targets');
    }
  }
}

function volumeForSet(exercise: DemoPlannedExercise, set: DemoPerformedSet) {
  if (asMetric(exercise) === 'duration_minutes') return Number(set.duration_minutes || 0);
  if (asMetric(exercise) === 'duration_seconds') return Number(set.weight || 0) * (Number(set.duration_seconds || 0) / 60);
  return Number(set.weight || 0) * Number(set.reps || 0);
}

function buildTarget(exercise: DemoPlannedExercise, setNumber: number): DemoSetTarget {
  const fromTarget = exercise.set_targets.find((candidate) => candidate.set_number === setNumber);
  const executionMetric = asMetric(exercise);
  return {
    set_number: setNumber,
    weight: resolveSetTarget({
      weight: exercise.suggested_weight,
      performed_sets: exercise.performed_sets,
      set_targets: exercise.set_targets,
    }, setNumber)!.weight,
    reps: fromTarget?.reps ?? (executionMetric === 'reps' ? exercise.target_reps : null),
    duration_minutes:
      fromTarget?.duration_minutes ?? (executionMetric === 'duration_minutes' ? exercise.target_duration_minutes : null),
    duration_seconds:
      fromTarget?.duration_seconds ?? (executionMetric === 'duration_seconds' ? exercise.target_duration_seconds : null),
    is_warmup: Boolean(fromTarget?.is_warmup),
  };
}

function syncSetTargets(exercise: DemoPlannedExercise) {
  const currentTargets = new Map(exercise.set_targets.map((target) => [target.set_number, target]));
  exercise.set_targets = Array.from({ length: exercise.target_sets }, (_, index) => {
    const setNumber = index + 1;
    const existing = currentTargets.get(setNumber);
    if (existing) return existing;
    return buildTarget(exercise, setNumber);
  });
}

function normalizeSetTargets(exercise: DemoPlannedExercise, executionMetric: ExecutionMetric, targetSets: number) {
  const currentTargets = new Map(exercise.set_targets.map((target) => [target.set_number, target]));
  return Array.from({ length: targetSets }, (_, index) => {
    const setNumber = index + 1;
    const existing = currentTargets.get(setNumber);
    const target = existing ? { ...existing } : buildTarget(exercise, setNumber);
    return {
      ...target,
      set_number: setNumber,
      reps: executionMetric === 'reps' ? (target.reps ?? exercise.target_reps) : null,
      duration_minutes: executionMetric === 'duration_minutes' ? (target.duration_minutes ?? exercise.target_duration_minutes) : null,
      duration_seconds: executionMetric === 'duration_seconds' ? (target.duration_seconds ?? exercise.target_duration_seconds) : null,
    };
  });
}

function refreshExerciseStatuses(session: DemoSession) {
  const ordered = [...session.planned_exercises].sort((first, second) => first.order - second.order);
  let activeAssigned = false;
  for (const exercise of ordered) {
    syncSetTargets(exercise);
    const completed = hasAllTargetSets(exercise);
    if (exercise.status === 'skipped') continue;
    if (completed) {
      exercise.status = 'completed';
      continue;
    }
    if (!activeAssigned) {
      exercise.status = 'in_progress';
      activeAssigned = true;
    } else {
      exercise.status = 'pending';
    }
  }
  session.planned_exercises = ordered;
}

function syncSession(session: DemoSession) {
  refreshExerciseStatuses(session);
  session.total_volume = session.planned_exercises.reduce(
    (total, exercise) => total + exercise.performed_sets.reduce((exerciseTotal, set) => exerciseTotal + volumeForSet(exercise, set), 0),
    0,
  );
  if (session.status !== 'completed' && session.planned_exercises.some((exercise) => exercise.status === 'in_progress')) {
    session.status = 'in_progress';
  }
  return session;
}

function sortSessionsDescending(sessions: DemoSession[]) {
  return [...sessions].sort((first, second) => {
    if (first.session_date === second.session_date) return second.id - first.id;
    return second.session_date.localeCompare(first.session_date);
  });
}

function findSession(source: DemoState, sessionId: number) {
  const session = source.sessions.find((item) => item.id === sessionId);
  if (!session) throw demoError(404, 'Session not found');
  return syncSession(session);
}

function findExercise(session: DemoSession, plannedId: number) {
  const exercise = session.planned_exercises.find((item) => item.id === plannedId);
  if (!exercise) throw demoError(404, 'Planned exercise not found in this session');
  return exercise;
}

function findSet(exercise: DemoPlannedExercise, setId: number) {
  const set = exercise.performed_sets.find((item) => item.id === setId);
  if (!set) throw demoError(404, 'Set not found in this exercise');
  return set;
}

function sessionCurrent(session: DemoSession) {
  const ordered = [...session.planned_exercises].sort((first, second) => first.order - second.order);
  const completedExercises = ordered.filter((exercise) => exercise.status === 'completed' || exercise.status === 'skipped').length;
  const completedSets = ordered.reduce((total, exercise) => total + exercise.performed_sets.length, 0);
  const totalSets = ordered.reduce((total, exercise) => total + exercise.target_sets, 0);
  const emptyState = {
    session_id: session.id,
    session_status: session.status,
    current_planned_exercise_id: null,
    current_exercise_id: null,
    current_exercise_name: null,
    current_set_number: null,
    target_sets: null,
    execution_metric: null,
    target_reps: null,
    target_duration_minutes: null,
    target_duration_seconds: null,
    suggested_weight: null,
    weight_mode: null,
    activity_type: null,
    next_set_target: null,
    exercise_order: null,
    exercise_count: ordered.length,
    completed_exercises: completedExercises,
    completed_sets: completedSets,
    total_sets: totalSets,
    is_complete: session.status === 'completed' || (ordered.length > 0 && completedExercises === ordered.length),
  };
  if (session.status === 'completed') return emptyState;
  const currentExercise = ordered.find((exercise) => exercise.status === 'in_progress');
  if (!currentExercise) return emptyState;
  const currentSetNumber = nextMissingSetNumber(currentExercise);
  const nextSetTarget = currentSetNumber == null ? null : buildTarget(currentExercise, currentSetNumber);
  if (nextSetTarget?.weight === null && currentExercise.activity_type !== 'cardio') {
    nextSetTarget.unloaded = true;
  }
  return {
    session_id: session.id,
    session_status: session.status,
    current_planned_exercise_id: currentExercise.id,
    current_exercise_id: currentExercise.exercise_id,
    current_exercise_name: currentExercise.exercise.name,
    current_set_number: currentSetNumber,
    target_sets: currentExercise.target_sets,
    execution_metric: asMetric(currentExercise),
    target_reps: currentExercise.target_reps,
    target_duration_minutes: currentExercise.target_duration_minutes,
    target_duration_seconds: currentExercise.target_duration_seconds,
    suggested_weight: currentExercise.suggested_weight,
    weight_mode: effectiveWeightMode(currentExercise),
    activity_type: currentExercise.activity_type,
    next_set_target: nextSetTarget,
    exercise_order: currentExercise.order,
    exercise_count: ordered.length,
    completed_exercises: completedExercises,
    completed_sets: completedSets,
    total_sets: totalSets,
    is_complete: ordered.length > 0 && completedExercises === ordered.length,
  };
}

function progressForExercise(source: DemoState, exerciseId: number) {
  return source.sessions
    .map((session) => {
      const exercise = session.planned_exercises.find((item) => item.exercise_id === exerciseId);
      if (!exercise || exercise.performed_sets.length === 0) return null;
      return {
        session_id: session.id,
        date: session.session_date,
        top_weight: Math.max(...exercise.performed_sets.map((set) => Number(set.weight || 0))),
        top_reps: Math.max(...exercise.performed_sets.map((set) => Number(set.reps || 0))),
        top_duration_minutes: Math.max(...exercise.performed_sets.map((set) => Number(set.duration_minutes || 0))),
        top_duration_seconds: Math.max(...exercise.performed_sets.map((set) => Number(set.duration_seconds || 0))),
        activity_type: exercise.activity_type,
        execution_metric: asMetric(exercise),
        volume: exercise.performed_sets.reduce((total, set) => total + volumeForSet(exercise, set), 0),
        weight_mode: effectiveWeightMode(exercise),
        sets: exercise.performed_sets.length,
      };
    })
    .filter(Boolean)
    .sort((first: any, second: any) => {
      const byDate = first.date.localeCompare(second.date);
      if (byDate !== 0) return byDate;
      return first.session_id - second.session_id;
    });
}

function records(source: DemoState) {
  return source.exercises
    .map((exercise) => {
      const points = progressForExercise(source, exercise.id);
      if (!points.length) return null;
      return {
        exercise_id: exercise.id,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        equipment: exercise.equipment,
        image_url: exercise.image_url,
        weight_mode: points.at(-1)?.weight_mode || 'weighted',
        activity_type: exercise.activity_type,
        max_weight: Math.max(...points.map((point: any) => point.top_weight || 0)),
        max_reps: Math.max(...points.map((point: any) => point.top_reps || 0)),
        max_duration_minutes: Math.max(...points.map((point: any) => point.top_duration_minutes || 0)),
        max_duration_seconds: Math.max(...points.map((point: any) => point.top_duration_seconds || 0)),
        last_date: points.at(-1)?.date || isoDaysAgo(0),
        sessions: points.length,
      };
    })
    .filter(Boolean);
}

function sessionActivity(source: DemoState) {
  return sortSessionsDescending(source.sessions)
    .filter((session) => session.status === 'completed')
    .map((session) => ({
      id: session.id,
      session_date: session.session_date,
      duration_actual: session.duration_actual,
      total_volume: session.total_volume,
    }));
}

function updateExercisePrescription(exercise: DemoPlannedExercise, payload: Record<string, any>, replacement?: CatalogExercise) {
  if (replacement && exercise.performed_sets.length > 0) {
    throw demoError(422, 'Cannot replace an exercise after logging sets');
  }
  const selectedExercise = replacement || exercise.exercise;
  const nextTargetSets = payload.target_sets != null ? Number(payload.target_sets) : exercise.target_sets;
  const highestLoggedSet = Math.max(0, ...exercise.performed_sets.map((set) => set.set_number));
  if (nextTargetSets < highestLoggedSet) {
    throw demoError(422, `Cannot reduce target_sets below ${highestLoggedSet} (highest logged set number)`);
  }

  let executionMetric: ExecutionMetric = payload.execution_metric || exercise.execution_metric;
  if (!payload.execution_metric && replacement?.activity_type === 'cardio') {
    executionMetric = 'duration_minutes';
  }
  if (!payload.execution_metric && payload.target_duration_seconds != null && selectedExercise.activity_type !== 'cardio') {
    executionMetric = 'duration_seconds';
  }
  if (!payload.execution_metric && selectedExercise.activity_type !== 'cardio' && (payload.target_reps != null || exercise.activity_type === 'cardio')) {
    executionMetric = 'reps';
  }

  if (exercise.performed_sets.length > 0 && executionMetric !== asMetric(exercise)) {
    throw demoError(422, 'Cannot change execution_metric with logged sets');
  }

  const nextSuggestedWeight = executionMetric === 'duration_minutes'
    ? null
    : payload.suggested_weight !== undefined
      ? payload.suggested_weight
      : exercise.suggested_weight;
  const nextTargetReps = executionMetric === 'reps'
    ? payload.target_reps !== undefined ? payload.target_reps : exercise.target_reps
    : null;
  const nextTargetDurationMinutes = executionMetric === 'duration_minutes'
    ? payload.target_duration_minutes !== undefined ? payload.target_duration_minutes : exercise.target_duration_minutes
    : null;
  const nextTargetDurationSeconds = executionMetric === 'duration_seconds'
    ? payload.target_duration_seconds !== undefined ? payload.target_duration_seconds : exercise.target_duration_seconds
    : null;
  const nextUnilateral = payload.unilateral !== undefined ? Boolean(payload.unilateral) : exercise.unilateral;

  validateDemoMetrics(selectedExercise.activity_type, {
    executionMetric,
    reps: nextTargetReps,
    durationMinutes: nextTargetDurationMinutes,
    durationSeconds: nextTargetDurationSeconds,
    weight: nextSuggestedWeight,
    unilateral: nextUnilateral,
    requireCardioDuration: false,
  });

  const suppliedTargets = payload.set_targets as Array<Record<string, any>> | undefined;
  validateDemoSetTargets(executionMetric, suppliedTargets);
  const baseExercise: DemoPlannedExercise = {
    ...exercise,
    set_targets: replacement ? [] : exercise.set_targets,
    exercise_id: selectedExercise.id,
    exercise: selectedExercise,
    activity_type: selectedExercise.activity_type,
    execution_metric: executionMetric,
    target_sets: nextTargetSets,
    target_reps: nextTargetReps,
    target_duration_minutes: nextTargetDurationMinutes,
    target_duration_seconds: nextTargetDurationSeconds,
    suggested_weight: nextSuggestedWeight,
  };
  const nextSetTargets = suppliedTargets
    ? suppliedTargets
      .filter((target) => Number(target.set_number) <= nextTargetSets)
      .map((target) => ({
        set_number: Number(target.set_number),
        ...(Object.prototype.hasOwnProperty.call(target, 'weight') ? { weight: target.weight } : {}),
        ...(target.unloaded === true ? { unloaded: true } : {}),
        reps: target.reps ?? null,
        duration_minutes: target.duration_minutes ?? null,
        duration_seconds: target.duration_seconds ?? null,
        is_warmup: Boolean(target.is_warmup),
      }))
    : normalizeSetTargets(baseExercise, executionMetric, nextTargetSets);
  for (const target of nextSetTargets || []) {
    validateDemoMetrics(selectedExercise.activity_type, {
      executionMetric,
      reps: target.reps,
      durationMinutes: target.duration_minutes,
      durationSeconds: target.duration_seconds,
      weight: target.weight,
      requireCardioDuration: false,
    });
  }

  exercise.exercise_id = selectedExercise.id;
  exercise.exercise = selectedExercise;
  exercise.activity_type = selectedExercise.activity_type;
  exercise.execution_metric = executionMetric;
  exercise.target_sets = nextTargetSets;
  exercise.suggested_weight = nextSuggestedWeight;
  exercise.status = payload.status || exercise.status;
  exercise.target_reps = nextTargetReps;
  exercise.target_duration_minutes = nextTargetDurationMinutes;
  exercise.target_duration_seconds = nextTargetDurationSeconds;
  exercise.unilateral = nextUnilateral;
  if (payload.notes !== undefined) exercise.notes = payload.notes;
  if (payload.superset_group !== undefined) exercise.superset_group = payload.superset_group;
  exercise.set_targets = nextSetTargets || [];
  exercise.weight_mode = effectiveWeightMode(exercise);
}

function restoreSetFromPayload(source: DemoState, exercise: DemoPlannedExercise, payload: Record<string, any>) {
  const executionMetric = asMetric(exercise);
  validateDemoMetrics(exercise.activity_type, {
    executionMetric,
    reps: payload.reps,
    durationMinutes: payload.duration_minutes,
    durationSeconds: payload.duration_seconds,
    weight: payload.weight,
    requireCardioDuration: true,
  });
  const restored: DemoPerformedSet = {
    id: source.nextSetId++,
    set_number: Number(payload.set_number),
    weight: payload.weight ?? null,
    reps: null,
    duration_minutes: null,
    duration_seconds: null,
    is_warmup: Boolean(payload.is_warmup),
    activity_type: exercise.activity_type,
    weight_mode: effectiveWeightMode(exercise),
    rpe: payload.rpe ?? null,
    rir: payload.rir ?? null,
    sensation: payload.sensation || '',
    notes: payload.notes || '',
    timestamp: new Date().toISOString(),
  };
  if (executionMetric === 'duration_minutes') restored.duration_minutes = Number(payload.duration_minutes || 0);
  if (executionMetric === 'duration_seconds') restored.duration_seconds = Number(payload.duration_seconds || 0);
  if (executionMetric === 'reps') restored.reps = Number(payload.reps || 0);
  exercise.performed_sets = exercise.performed_sets
    .filter((set) => set.set_number !== restored.set_number)
    .concat(restored)
    .sort((first, second) => first.set_number - second.set_number);
}

export const isDemoMode = () =>
  typeof location !== 'undefined' && /^\/demo\/?$/.test(location.pathname);

export async function demoFetch(method: string, path: string, body?: any): Promise<any> {
  const url = new URL(path, 'https://demo.local');
  const pathname = url.pathname;

  if (pathname === '/demo/reset') {
    if (method !== 'POST') throw new Error('Método demo no soportado.');
    resetDemoState();
    return { ok: true };
  }

  if (pathname === '/profile') {
    if (method === 'GET') return clone(state.profile);
    if (method === 'PATCH') {
      return mutateDemo((draft) => {
        draft.profile = {
          ...draft.profile,
          ...body,
          updated_at: new Date().toISOString(),
        };
        return draft.profile;
      });
    }
  }

  if (pathname === '/profile/measurements') {
    if (method === 'GET') {
      const limit = Number(url.searchParams.get('limit') || state.measurements.length);
      return clone(
        [...state.measurements]
          .sort((first, second) => second.measured_at.localeCompare(first.measured_at))
          .slice(0, limit),
      );
    }
    if (method === 'POST') {
      return mutateDemo((draft) => {
        const measurement: DemoMeasurement = {
          id: draft.nextMeasurementId++,
          measured_at: body.measured_at,
          source: body.source || 'manual',
          weight_kg: body.weight_kg,
          muscle_kg: body.muscle_kg,
          fat_kg: body.fat_kg,
          body_fat_pct: body.body_fat_pct,
          visceral_fat: body.visceral_fat,
          notes: body.notes || '',
        };
        draft.measurements.unshift(measurement);
        if (typeof measurement.weight_kg === 'number') draft.profile.weight_kg = measurement.weight_kg;
        draft.profile.updated_at = new Date().toISOString();
        return measurement;
      });
    }
  }

  if (pathname === '/disliked-exercises') {
    if (method === 'GET') {
      return clone(
        state.dislikedExerciseIds.map((exerciseId) => ({
          exercise_id: exerciseId,
          exercise: state.exercises.find((exercise) => exercise.id === exerciseId) || null,
        })),
      );
    }
    if (method === 'POST') {
      return mutateDemo((draft) => {
        const exerciseId = Number(body?.exercise_id);
        if (!draft.dislikedExerciseIds.includes(exerciseId)) draft.dislikedExerciseIds.push(exerciseId);
        return { exercise_id: exerciseId };
      });
    }
  }

  const dislikedMatch = pathname.match(/^\/disliked-exercises\/(\d+)$/);
  if (dislikedMatch && method === 'DELETE') {
    return mutateDemo((draft) => {
      draft.dislikedExerciseIds = draft.dislikedExerciseIds.filter((exerciseId) => exerciseId !== Number(dislikedMatch[1]));
      return { ok: true };
    });
  }

  if (pathname === '/sessions/active') {
    const active = sortSessionsDescending(state.sessions).find((session) => session.status !== 'completed');
    return active ? clone({ session: syncSession(active), current: sessionCurrent(active) }) : null;
  }
  if (pathname === '/sessions/activity') return clone(sessionActivity(state));

  if (pathname === '/sessions') {
    const limit = Number(url.searchParams.get('limit') || '30');
    const offset = Number(url.searchParams.get('offset') || '0');
    const completedOnly = url.searchParams.get('completed_only') === 'true';
    const onDate = url.searchParams.get('on_date');
    const filtered = sortSessionsDescending(state.sessions)
      .filter((session) => !completedOnly || session.status === 'completed')
      .filter((session) => !onDate || session.session_date === onDate)
      .map((session) => sessionSummary(syncSession(session)));
    return clone(filtered.slice(offset, offset + limit));
  }

  if (pathname === '/exercises/facets') {
    return {
      muscle_groups: [...new Set(state.exercises.map((exercise) => exercise.muscle_group))],
      body_parts: [...new Set(state.exercises.map((exercise) => exercise.body_part))],
      equipment: [...new Set(state.exercises.map((exercise) => exercise.equipment))],
      activity_types: [...new Set(state.exercises.map((exercise) => exercise.activity_type))],
    };
  }
  if (pathname === '/exercises/records') return clone(records(state));

  const progressMatch = pathname.match(/^\/exercises\/(\d+)\/progress$/);
  if (progressMatch && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || '50');
    const points = progressForExercise(state, Number(progressMatch[1]));
    return clone(points.slice(-limit));
  }

  const exerciseMatch = pathname.match(/^\/exercises\/(\d+)$/);
  if (exerciseMatch && method === 'GET') {
    const exercise = state.exercises.find((item) => item.id === Number(exerciseMatch[1]));
    if (exercise) return clone(exercise);
    throw demoError(404, 'Exercise not found');
  }

  if (pathname === '/exercises') {
    const search = (url.searchParams.get('search') || '').toLocaleLowerCase('es');
    const muscleGroup = url.searchParams.get('muscle_group') || '';
    const bodyPart = url.searchParams.get('body_part') || '';
    const equipment = url.searchParams.get('equipment') || '';
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 30);
    return clone(
      state.exercises
        .filter((exercise) => !search || exercise.name.toLocaleLowerCase('es').includes(search))
        .filter((exercise) => !muscleGroup || exercise.muscle_group === muscleGroup)
        .filter((exercise) => !bodyPart || exercise.body_part === bodyPart)
        .filter((exercise) => !equipment || exercise.equipment === equipment)
        .slice(offset, offset + limit),
    );
  }

  const shareMatch = pathname.match(/^\/sessions\/share\/([^/]+)$/);
  if (shareMatch && method === 'GET') {
    const session = state.sessions.find((item) => item.share_token === decodeURIComponent(shareMatch[1]));
    if (session) return clone(syncSession(session));
    throw demoError(404, 'Shared session not found');
  }

  const sessionCurrentMatch = pathname.match(/^\/sessions\/(\d+)\/current$/);
  if (sessionCurrentMatch && method === 'GET') {
    const session = findSession(state, Number(sessionCurrentMatch[1]));
    return clone(sessionCurrent(session));
  }

  const sessionMatch = pathname.match(/^\/sessions\/(\d+)$/);
  if (sessionMatch && method === 'GET') {
    const session = findSession(state, Number(sessionMatch[1]));
    return clone(session);
  }

  const repeatMatch = pathname.match(/^\/sessions\/(\d+)\/repeat$/);
  if (repeatMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const source = findSession(draft, Number(repeatMatch[1]));
      const repeated: DemoSession = {
        ...clone(source),
        id: draft.nextSessionId++,
        session_date: isoDaysAgo(0),
        status: 'planned',
        duration_actual: 0,
        feedback: '',
        share_token: `demo-${draft.nextSessionId}`,
        planned_exercises: source.planned_exercises.map((exercise, index) =>
          planned(
            draft.nextPlannedExerciseId++,
            exercise.exercise_id,
            index,
            exercise.suggested_weight,
            exercise.target_duration_minutes ?? exercise.target_duration_seconds ?? exercise.target_reps ?? 0,
            'pending',
            asMetric(exercise),
            [],
            exercise.target_sets,
          ),
        ),
        total_volume: 0,
      };
      draft.sessions.unshift(syncSession(repeated));
      return repeated;
    });
  }

  const finishMatch = pathname.match(/^\/sessions\/(\d+)\/finish$/);
  if (finishMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(finishMatch[1]));
      session.status = 'completed';
      session.feedback = body?.feedback || '';
      session.energy = body?.energy || session.energy;
      session.discomfort = body?.discomfort || session.discomfort;
      session.duration_actual = session.duration_actual || session.duration_estimated;
      for (const exercise of session.planned_exercises) {
        if (exercise.status !== 'skipped' && exercise.performed_sets.length > 0) exercise.status = 'completed';
      }
      syncSession(session);
      return session;
    });
  }

  const reorderMatch = pathname.match(/^\/sessions\/(\d+)\/exercises\/reorder$/);
  if (reorderMatch && method === 'PUT') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(reorderMatch[1]));
      const requested = Array.isArray(body?.planned_exercise_ids) ? body.planned_exercise_ids.map(Number) : [];
      const existingIds = session.planned_exercises.map((exercise) => exercise.id);
      if (requested.length !== existingIds.length || new Set(requested).size !== requested.length || requested.some((id) => !existingIds.includes(id))) {
        throw demoError(422, 'Order must contain every exercise exactly once');
      }
      const orderMap = new Map<number, number>(requested.map((id: number, index: number) => [id, index]));
      session.planned_exercises.sort((first, second) => (orderMap.get(first.id) ?? first.order) - (orderMap.get(second.id) ?? second.order));
      session.planned_exercises.forEach((exercise, index) => { exercise.order = index; });
      return syncSession(session);
    });
  }

  const addExerciseMatch = pathname.match(/^\/sessions\/(\d+)\/exercises$/);
  if (addExerciseMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(addExerciseMatch[1]));
      const catalogExercise = draft.exercises.find((exercise) => exercise.id === Number(body?.exercise_id));
      if (!catalogExercise) throw demoError(404, `Exercise ${Number(body?.exercise_id)} not found`);
      const executionMetric: ExecutionMetric = body?.execution_metric || (catalogExercise.activity_type === 'cardio' ? 'duration_minutes' : 'reps');
      validateDemoSetTargets(executionMetric, body?.set_targets);
      validateDemoMetrics(catalogExercise.activity_type, {
        executionMetric,
        reps: body?.target_reps,
        durationMinutes: body?.target_duration_minutes,
        durationSeconds: body?.target_duration_seconds,
        weight: executionMetric === 'duration_minutes' ? null : body?.suggested_weight,
        unilateral: Boolean(body?.unilateral),
        requireCardioDuration: false,
      });
      const created = planned(
        draft.nextPlannedExerciseId++,
        catalogExercise.id,
        session.planned_exercises.length,
        executionMetric === 'duration_minutes' ? null : (body?.suggested_weight ?? null),
        body?.target_duration_minutes ?? body?.target_duration_seconds ?? body?.target_reps ?? null,
        'pending',
        executionMetric,
        [],
        Number(body?.target_sets || 3),
      );
      if (Array.isArray(body?.set_targets)) {
        created.set_targets = body.set_targets.map((target: any) => ({
          set_number: Number(target.set_number),
          ...(Object.prototype.hasOwnProperty.call(target, 'weight') ? { weight: target.weight } : {}),
          ...(target.unloaded === true ? { unloaded: true } : {}),
          reps: target.reps ?? null,
          duration_minutes: target.duration_minutes ?? null,
          duration_seconds: target.duration_seconds ?? null,
          is_warmup: Boolean(target.is_warmup),
        }));
      }
      session.planned_exercises.push(created);
      return syncSession(session);
    });
  }

  const exerciseMatchWithSession = pathname.match(/^\/sessions\/(\d+)\/exercises\/(\d+)$/);
  if (exerciseMatchWithSession) {
    if (method === 'DELETE') {
      return mutateDemo((draft) => {
        const session = findSession(draft, Number(exerciseMatchWithSession[1]));
        const exercise = findExercise(session, Number(exerciseMatchWithSession[2]));
        if (exercise.performed_sets.length > 0) {
          throw demoError(422, 'Cannot delete an exercise with logged sets');
        }
        session.planned_exercises = session.planned_exercises.filter((item) => item.id !== exercise.id);
        session.planned_exercises.forEach((item, index) => { item.order = index; });
        return syncSession(session);
      });
    }
    if (method === 'PUT') {
      return mutateDemo((draft) => {
        const session = findSession(draft, Number(exerciseMatchWithSession[1]));
        const exercise = findExercise(session, Number(exerciseMatchWithSession[2]));
        const replacement = body?.new_exercise_id
          ? draft.exercises.find((item) => item.id === Number(body.new_exercise_id))
          : undefined;
        if (body?.new_exercise_id && !replacement) {
          throw demoError(404, 'Exercise not found in catalog');
        }
        updateExercisePrescription(exercise, body || {}, replacement);
        return syncSession(session);
      });
    }
  }

  const completeMatch = pathname.match(/^\/sessions\/(\d+)\/exercises\/(\d+)\/complete$/);
  if (completeMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(completeMatch[1]));
      const exercise = findExercise(session, Number(completeMatch[2]));
      exercise.status = 'completed';
      return syncSession(session);
    });
  }

  const restoreMatch = pathname.match(/^\/sessions\/(\d+)\/exercises\/(\d+)\/sets\/restore$/);
  if (restoreMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(restoreMatch[1]));
      const exercise = findExercise(session, Number(restoreMatch[2]));
      const setNumber = Number(body?.set_number);
      if (performedSetNumbers(exercise).has(setNumber)) {
        throw demoError(409, 'That set number already exists');
      }
      if (setNumber > exercise.target_sets) {
        throw demoError(422, 'Cannot restore a set beyond the target');
      }
      restoreSetFromPayload(draft, exercise, body || {});
      return syncSession(session);
    });
  }

  const setMatch = pathname.match(/^\/sessions\/(\d+)\/exercises\/(\d+)\/sets\/(\d+)$/);
  if (setMatch) {
    if (method === 'PATCH') {
      return mutateDemo((draft) => {
        const session = findSession(draft, Number(setMatch[1]));
        const exercise = findExercise(session, Number(setMatch[2]));
        const set = findSet(exercise, Number(setMatch[3]));
        const executionMetric = asMetric(exercise);
        const fields = new Set(Object.keys(body || {}));
        if (executionMetric === 'duration_minutes' && (fields.has('reps') || fields.has('duration_seconds'))) {
          throw demoError(422, 'Cardio requires duration_minutes');
        }
        if (executionMetric === 'duration_seconds' && (fields.has('reps') || fields.has('duration_minutes'))) {
          throw demoError(422, 'Timed strength requires duration_seconds and does not accept reps or duration_minutes');
        }
        if (executionMetric === 'reps' && (fields.has('duration_minutes') || fields.has('duration_seconds'))) {
          throw demoError(422, 'Strength requires reps and does not accept duration_minutes or duration_seconds');
        }
        const nextWeight = fields.has('weight') ? (body?.weight ?? null) : set.weight;
        const nextReps = executionMetric === 'reps' ? (fields.has('reps') ? body?.reps ?? null : set.reps) : null;
        const nextDurationMinutes = executionMetric === 'duration_minutes'
          ? (fields.has('duration_minutes') ? body?.duration_minutes ?? null : set.duration_minutes)
          : null;
        const nextDurationSeconds = executionMetric === 'duration_seconds'
          ? (fields.has('duration_seconds') ? body?.duration_seconds ?? null : set.duration_seconds)
          : null;
        validateDemoMetrics(exercise.activity_type, {
          executionMetric,
          reps: nextReps,
          durationMinutes: nextDurationMinutes,
          durationSeconds: nextDurationSeconds,
          weight: nextWeight,
          requireCardioDuration: true,
        });
        Object.assign(set, {
          weight: nextWeight,
          is_warmup: fields.has('is_warmup') ? Boolean(body?.is_warmup) : set.is_warmup,
          notes: fields.has('notes') ? (body?.notes || '') : set.notes,
          sensation: fields.has('sensation') ? (body?.sensation || '') : set.sensation,
          rir: fields.has('rir') ? (body?.rir ?? null) : set.rir,
          rpe: fields.has('rpe') ? (body?.rpe ?? null) : set.rpe,
        });
        set.reps = nextReps;
        set.duration_minutes = nextDurationMinutes;
        set.duration_seconds = nextDurationSeconds;
        return syncSession(session);
      });
    }
    if (method === 'DELETE') {
      return mutateDemo((draft) => {
        const session = findSession(draft, Number(setMatch[1]));
        const exercise = findExercise(session, Number(setMatch[2]));
        const set = findSet(exercise, Number(setMatch[3]));
        exercise.performed_sets = exercise.performed_sets.filter((item) => item.id !== set.id);
        return syncSession(session);
      });
    }
  }

  const addSetMatch = pathname.match(/^\/sessions\/(\d+)\/exercises\/(\d+)\/sets$/);
  if (addSetMatch && method === 'POST') {
    return mutateDemo((draft) => {
      const session = findSession(draft, Number(addSetMatch[1]));
      const exercise = findExercise(session, Number(addSetMatch[2]));
      const nextSetNumber = nextMissingSetNumber(exercise);
      if (nextSetNumber == null || Number(body?.set_number) !== nextSetNumber) {
        throw demoError(422, 'Log the earliest missing target set number and do not exceed the target');
      }
      restoreSetFromPayload(draft, exercise, body || {});
      syncSession(session);
      if (
        session.status === 'in_progress'
        && session.planned_exercises.length > 0
        && session.planned_exercises.every((item) => item.status === 'completed' || item.status === 'skipped')
      ) {
        session.status = 'completed';
      }
      return session;
    });
  }

  throw demoError(404, `Pantalla no disponible en la demo: ${pathname}`);
}
