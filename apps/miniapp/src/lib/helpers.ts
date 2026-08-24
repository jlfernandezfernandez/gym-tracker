import taxonomy from './exercise-taxonomy.json';
import { EQUIPMENT_ES, STATUS_ES } from './translations';
import { normalizeMuscle, MUSCLE_LABELS_ES } from './body-paths';

type TaxonomyTerm = { es: string; bodyMap: string[] };
export const EXERCISE_TAXONOMY = taxonomy as Record<string, TaxonomyTerm>;

export const formatStatus = (status: string) => STATUS_ES[status] || status;

export const formatMuscle = (muscle: string) => {
  const value = String(muscle || '').trim();
  if (!value) return '';
  const norm = normalizeMuscle(value);
  if (norm && MUSCLE_LABELS_ES[norm]) {
    return MUSCLE_LABELS_ES[norm];
  }
  return EXERCISE_TAXONOMY[value.toLowerCase()]?.es || (value[0].toUpperCase() + value.slice(1));
};

export const formatWeight = (weight: number | null | undefined, mode: string | null) =>
  mode === 'bodyweight' ? 'Peso corporal' : weight != null ? `${weight} kg` : '';

export const executionMetricPayload = (
  activityType: 'strength' | 'cardio',
  values: { weight?: number | null; reps?: number | null; duration_minutes?: number | null },
) => activityType === 'cardio'
  ? { duration_minutes: values.duration_minutes }
  : { weight: values.weight, reps: values.reps };


export const formatEquipment = (equipment: string) =>
  EQUIPMENT_ES[String(equipment || '').toLowerCase()] || equipment;

export const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function normalizeSession(session: any) {
  const orderedExercises = [...(session?.planned_exercises || [])].sort(
    (first, second) => (first.order ?? 0) - (second.order ?? 0),
  );
  return {
    ...session,
    exercises: orderedExercises.map((plannedExercise) => ({
      planned_id: plannedExercise.id,
      exercise_id: plannedExercise.exercise_id,
      order: plannedExercise.order,
      sets: plannedExercise.target_sets,
      reps: plannedExercise.target_reps,
      duration_minutes: plannedExercise.target_duration_minutes,
      weight: plannedExercise.suggested_weight,
      weight_mode: plannedExercise.weight_mode,
      unilateral: plannedExercise.unilateral === true,
      notes: plannedExercise.notes || '',
      status: plannedExercise.status || 'pending',
      performed_sets: plannedExercise.performed_sets || [],
      set_targets: plannedExercise.set_targets || null,
      ...(plannedExercise.exercise || {}),
    })),
  };
}

export function mediaUrl(url?: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : location.origin + url;
}

function splitMuscles(muscleList?: string) {
  return String(muscleList || '')
    .split(',')
    .map((muscle) => muscle.trim())
    .filter(Boolean);
}

export function sessionMuscles(exercises: any[]) {
  return [
    ...new Set<string>(
      exercises
        .flatMap((exercise: any) => [
          exercise.target,
          exercise.body_part,
          exercise.muscle_group,
          ...splitMuscles(exercise.secondary_muscles),
        ])
        .filter(Boolean),
    ),
  ];
}

export const completedSetCount = (exercise: any) => exercise.performed_sets?.length || 0;

export function missingSetNumbers(exercise: any): number[] {
  const performed = new Set((exercise.performed_sets || []).map((set: any) => set.set_number));
  return Array.from({ length: exercise.sets || 0 }, (_, index) => index + 1).filter(
    (setNumber) => !performed.has(setNumber),
  );
}

/** Owner-only workout edits require an editable session and exercise. */
export function canEditWorkout(
  readOnly: boolean,
  sessionStatus: string | undefined,
  exerciseStatus: string | undefined,
) {
  return !readOnly && sessionStatus !== 'completed' && exerciseStatus !== 'completed';
}

export function parseWeight(raw: string): number {
  return Number((raw || '0').replace(',', '.'));
}
export function currentExercise(plan: any, currentState: any) {
  const currentPlannedId = currentState?.current_planned_exercise_id;
  // A session has one active exercise. Use the backend pointer only when it is actually in progress.
  const backendCurrent = plan?.exercises?.find(
    (exercise: any) =>
      String(exercise.planned_id) === String(currentPlannedId) &&
      exercise.status === 'in_progress',
  );
  if (backendCurrent) return backendCurrent;
  return (
    plan?.exercises?.find((exercise: any) => exercise.status === 'in_progress') ||
    plan?.exercises?.find((exercise: any) => exercise.status === 'pending') ||
    plan?.exercises?.[0]
  );
}

export function showToast(message: string, type?: string, actionLabel?: string, action?: () => void) {
  const toastElement = document.createElement('div');
  toastElement.className = 'toast' + (type ? ' ' + type : '');
  toastElement.setAttribute('role', type === 'err' ? 'alert' : 'status');
  toastElement.setAttribute('aria-live', type === 'err' ? 'assertive' : 'polite');
  const text = document.createElement('span');
  text.textContent = message;
  toastElement.appendChild(text);
  if (actionLabel && action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ml-2 font-bold underline';
    button.textContent = actionLabel;
    button.onclick = () => {
      action();
      toastElement.remove();
    };
    toastElement.appendChild(button);
  }
  document.body.appendChild(toastElement);
  setTimeout(() => toastElement.remove(), 5000);
}
