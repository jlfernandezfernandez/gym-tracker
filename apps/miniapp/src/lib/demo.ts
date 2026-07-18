const MEDIA = 'https://jlfernandezfernandez.github.io/gym-tracker/media';

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const exercises = [
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
    instructions: 'Curl without swinging your torso.',
    instructions_es: 'Mantén los codos cerca del cuerpo y sube la barra sin balancear el torso.',
    image_url: `${MEDIA}/0031-25GPyDY.gif`,
    gif_url: `${MEDIA}/0031-25GPyDY.gif`,
  },
];

const performed = (id: number, setNumber: number, weight: number, reps: number, daysAgo = 0) => ({
  id,
  set_number: setNumber,
  weight,
  weight_mode: 'weighted',
  reps,
  rpe: 8,
  sensation: 'ok',
  notes: '',
  timestamp: `${isoDaysAgo(daysAgo)}T18:30:00`,
});

const planned = (
  id: number,
  exerciseId: number,
  order: number,
  weight: number,
  reps: number,
  status: string,
  sets: any[] = [],
) => ({
  id,
  exercise_id: exerciseId,
  order,
  target_sets: 3,
  target_reps: reps,
  suggested_weight: weight,
  weight_mode: 'weighted',
  notes: '',
  status,
  set_targets: [1, 2, 3].map((setNumber) => ({ set_number: setNumber, weight, reps })),
  exercise: exercises.find((exercise) => exercise.id === exerciseId),
  performed_sets: sets,
});

const activeSession = {
  id: 900,
  session_date: isoDaysAgo(0),
  title: 'Torso · Fuerza',
  goal: 'Técnica sólida y progresión controlada',
  status: 'in_progress',
  energy: 7,
  discomfort: '',
  duration_estimated: 50,
  duration_actual: 0,
  feedback: '',
  coach_summary: 'Sesión adaptada a una energía buena y 50 minutos disponibles.',
  share_token: 'demo',
  total_volume: 1440,
  planned_exercises: [
    planned(9001, 101, 0, 70, 8, 'in_progress', [performed(90001, 1, 70, 8), performed(90002, 2, 70, 8)]),
    planned(9002, 102, 1, 62.5, 10, 'pending'),
    planned(9003, 104, 2, 35, 10, 'pending'),
    planned(9004, 106, 3, 25, 12, 'pending'),
  ],
};

const completedSession = (id: number, daysAgo: number, title: string, specs: [number, number, number][]) => ({
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
  total_volume: specs.reduce((total, [, weight, reps]) => total + weight * reps * 3, 0),
  planned_exercises: specs.map(([exerciseId, weight, reps], index) =>
    planned(
      id * 10 + index,
      exerciseId,
      index,
      weight,
      reps,
      'completed',
      [1, 2, 3].map((setNumber) => performed(id * 100 + index * 10 + setNumber, setNumber, weight, reps, daysAgo)),
    ),
  ),
});

const completedSessions = [
  completedSession(901, 3, 'Pierna · Base', [[103, 85, 8], [105, 90, 6]]),
  completedSession(902, 7, 'Torso · Volumen', [[101, 67.5, 10], [102, 60, 10], [104, 32.5, 10]]),
  completedSession(903, 12, 'Full body', [[103, 80, 10], [101, 65, 10], [106, 22.5, 12]]),
  completedSession(904, 18, 'Torso · Técnica', [[101, 62.5, 10], [102, 55, 12]]),
];

const progressPoint = (sessionId: number, daysAgo: number, topWeight: number, topReps: number, volume: number, sets: number) => ({
  session_id: sessionId,
  date: isoDaysAgo(daysAgo),
  top_weight: topWeight,
  top_reps: topReps,
  volume,
  weight_mode: 'weighted',
  sets,
});

const progress: Record<number, any[]> = {
  101: [
    progressPoint(904, 18, 62.5, 10, 1875, 3),
    progressPoint(903, 12, 65, 10, 1950, 3),
    progressPoint(902, 7, 67.5, 10, 2025, 3),
    progressPoint(900, 0, 70, 8, 1120, 2),
  ],
  102: [progressPoint(904, 18, 55, 12, 1980, 3), progressPoint(902, 7, 60, 10, 1800, 3)],
  103: [progressPoint(903, 12, 80, 10, 2400, 3), progressPoint(901, 3, 85, 8, 2040, 3)],
  104: [progressPoint(902, 7, 32.5, 10, 975, 3), progressPoint(900, 0, 35, 10, 0, 0)],
  105: [progressPoint(901, 3, 90, 6, 1620, 3)],
  106: [progressPoint(903, 12, 22.5, 12, 810, 3)],
};

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

const records = exercises.slice(0, 6).map((exercise) => {
  const points = progress[exercise.id] || [];
  return {
    exercise_id: exercise.id,
    name: exercise.name,
    muscle_group: exercise.muscle_group,
    equipment: exercise.equipment,
    image_url: exercise.image_url,
    weight_mode: 'weighted',
    max_weight: Math.max(...points.map((point) => point.top_weight || 0)),
    max_reps: Math.max(...points.map((point) => point.top_reps || 0)),
    last_date: points.at(-1)?.date || isoDaysAgo(0),
    sessions: points.length,
  };
});

const profile = {
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

const measurements = [0, 7, 14, 21, 28].map((daysAgo, index) => ({
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

const clone = <T>(value: T): T =>
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));

export const isDemoMode = () =>
  typeof location !== 'undefined' && /^\/demo\/?$/.test(location.pathname);

export async function demoFetch(method: string, path: string): Promise<any> {
  if (method !== 'GET') throw new Error('La demo es solo lectura.');

  const url = new URL(path, 'https://demo.local');
  const pathname = url.pathname;

  if (pathname === '/profile') return clone(profile);
  if (pathname === '/profile/measurements') return clone(measurements);
  if (pathname === '/sessions/active') {
    return clone({
      session: activeSession,
      current: {
        current_planned_exercise_id: 9001,
        current_exercise_name: 'Press banca',
        completed_sets: 2,
        total_sets: 12,
        target_sets: 3,
      },
    });
  }
  if (pathname === '/sessions') return clone(completedSessions.map(sessionSummary));
  if (pathname === '/exercises/facets') {
    return {
      muscle_groups: [...new Set(exercises.map((exercise) => exercise.muscle_group))],
      body_parts: [...new Set(exercises.map((exercise) => exercise.body_part))],
      equipment: [...new Set(exercises.map((exercise) => exercise.equipment))],
    };
  }
  if (pathname === '/exercises/records') return clone(records);
  if (pathname === '/disliked-exercises') return [];

  const sessionMatch = pathname.match(/^\/sessions\/(\d+)$/);
  if (sessionMatch) {
    const sessionId = Number(sessionMatch[1]);
    const session = sessionId === activeSession.id ? activeSession : completedSessions.find((item) => item.id === sessionId);
    if (session) return clone(session);
  }

  const progressMatch = pathname.match(/^\/exercises\/(\d+)\/progress$/);
  if (progressMatch) return clone(progress[Number(progressMatch[1])] || []);

  const exerciseMatch = pathname.match(/^\/exercises\/(\d+)$/);
  if (exerciseMatch) {
    const exercise = exercises.find((item) => item.id === Number(exerciseMatch[1]));
    if (exercise) return clone(exercise);
  }

  if (pathname === '/exercises') {
    const search = (url.searchParams.get('search') || '').toLocaleLowerCase('es');
    const muscleGroup = url.searchParams.get('muscle_group') || '';
    const bodyPart = url.searchParams.get('body_part') || '';
    const equipment = url.searchParams.get('equipment') || '';
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 30);
    return clone(
      exercises
        .filter((exercise) => !search || exercise.name.toLocaleLowerCase('es').includes(search))
        .filter((exercise) => !muscleGroup || exercise.muscle_group === muscleGroup)
        .filter((exercise) => !bodyPart || exercise.body_part === bodyPart)
        .filter((exercise) => !equipment || exercise.equipment === equipment)
        .slice(offset, offset + limit),
    );
  }

  throw new Error(`Pantalla no disponible en la demo: ${pathname}`);
}
