/** Session data helpers and small UI utilities. */
import taxonomy from './exercise-taxonomy.json';

const STATUS_ES: Record<string, string> = {
  planned: 'Planificada',
  active: 'Activa',
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Hecho',
  skipped: 'Saltado',
  changed: 'Cambiado',
};

type TaxonomyTerm = { es: string; bodyMap: string[] };
export const EXERCISE_TAXONOMY = taxonomy as Record<string, TaxonomyTerm>;

export const formatStatus = (status: string) => STATUS_ES[status] || status;

export const formatMuscle = (muscle: string) => {
  const value = String(muscle || '').trim();
  return EXERCISE_TAXONOMY[value.toLowerCase()]?.es || (value ? value[0].toUpperCase() + value.slice(1) : '');
};

export const formatWeight = (kg: number) => (kg ? `${kg} kg` : 'Peso corporal');

export const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Legacy titles embed the date ("Pecho · 09/07"); session_date is the source of truth. */
export const cleanTitle = (title: string) =>
  String(title || 'Entrenamiento').replace(/\s*[·\-–—]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '');

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
      sets: plannedExercise.target_sets || 3,
      reps: plannedExercise.target_reps || 10,
      weight: plannedExercise.suggested_weight || 0,
      notes: plannedExercise.notes || '',
      status: plannedExercise.status || 'pending',
      performed_sets: plannedExercise.performed_sets || [],
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
export function currentExercise(plan: any, currentState: any) {
  const currentPlannedId = currentState?.current_planned_exercise_id;
  return (
    plan?.exercises?.find((exercise: any) => String(exercise.planned_id) === String(currentPlannedId)) ||
    plan?.exercises?.find((exercise: any) => ['pending', 'in_progress', 'changed'].includes(exercise.status)) ||
    plan?.exercises?.[0]
  );
}

export function showToast(message: string, type?: string) {
  const toastElement = document.createElement('div');
  toastElement.className = 'toast' + (type ? ' ' + type : '');
  toastElement.setAttribute('role', type === 'err' ? 'alert' : 'status');
  toastElement.setAttribute('aria-live', type === 'err' ? 'assertive' : 'polite');
  toastElement.textContent = message;
  document.body.appendChild(toastElement);
  setTimeout(() => toastElement.remove(), 2800);
}
