/** App state and session data helpers. */
import { api } from './api';
import { inTelegram } from './telegram';

export interface AppState {
  session: any;
  plan: any;
  current: any;
  readOnly: boolean;
}

export const state: AppState = { session: null, plan: null, current: null, readOnly: false };

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

export function completedSets(ex: any) {
  return ex.performed_sets?.length || 0;
}

export function exerciseProgressPct(ex: any) {
  return ex.sets ? Math.min(100, Math.round((completedSets(ex) / ex.sets) * 100)) : 0;
}

export function currentExercise() {
  const id = state.current?.current_planned_exercise_id;
  return (
    state.plan?.exercises?.find((e: any) => String(e.planned_id) === String(id)) ||
    state.plan?.exercises?.find((e: any) => ['pending', 'in_progress', 'changed'].includes(e.status)) ||
    state.plan?.exercises?.[0]
  );
}

export async function loadSession(id: string | null, share?: string) {
  state.readOnly = !!share && !inTelegram(); // read-only only if no Telegram auth
  const s = share
    ? await api('GET', '/sessions/share/' + encodeURIComponent(share))
    : await api('GET', '/sessions/' + encodeURIComponent(id!));
  state.session = s;
  state.plan = normalize(s);
  try {
    if (!state.readOnly) state.current = await api('GET', '/sessions/' + s.id + '/current');
  } catch {
    state.current = null;
  }
  return state.plan;
}

/** Replace session state after a mutation and refresh derived current-exercise state. */
export async function refreshSession(updated: any) {
  state.session = updated;
  state.plan = normalize(updated);
  try {
    state.current = await api('GET', '/sessions/' + updated.id + '/current');
  } catch {}
}
