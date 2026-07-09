/** Session data helpers and small UI utilities. */

export const STATUS_ES: Record<string, string> = {
  pending: 'pendiente',
  in_progress: 'en curso',
  completed: 'hecho',
  skipped: 'saltado',
  changed: 'cambiado',
};

export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Legacy titles embed the date ("Pecho · 09/07"); session_date is the source of truth. */
export const cleanTitle = (t: string) =>
  String(t || 'Entrenamiento').replace(/\s*[·\-–—]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '');

export function normalize(s: any) {
  const pl = [...(s?.planned_exercises || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    ...s,
    exercises: pl.map((pe) => ({
      planned_id: pe.id,
      exercise_id: pe.exercise_id,
      order: pe.order,
      sets: pe.target_sets || 3,
      reps: pe.target_reps || 10,
      weight: pe.suggested_weight || 0,
      notes: pe.notes || '',
      status: pe.status || 'pending',
      performed_sets: pe.performed_sets || [],
      ...(pe.exercise || {}),
    })),
  };
}

export function mediaUrl(url?: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : location.origin + url;
}

export function splitMuscles(s?: string) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function sessionMuscles(exs: any[]) {
  return [
    ...new Set<string>(
      exs.flatMap((e: any) => [e.target, e.body_part, e.muscle_group, ...splitMuscles(e.secondary_muscles)]).filter(Boolean),
    ),
  ];
}

export const completedSets = (ex: any) => ex.performed_sets?.length || 0;

export function currentExercise(plan: any, current: any) {
  const id = current?.current_planned_exercise_id;
  return (
    plan?.exercises?.find((e: any) => String(e.planned_id) === String(id)) ||
    plan?.exercises?.find((e: any) => ['pending', 'in_progress', 'changed'].includes(e.status)) ||
    plan?.exercises?.[0]
  );
}

export function toast(msg: string, type?: string) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
