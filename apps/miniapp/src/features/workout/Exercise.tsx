/** Exercise: detail, set logging and completion. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { chartUsesWeight, type ProgressPoint } from '../../lib/chart';
import { completedSetCount, formatMuscle, formatWeight, mediaUrl, parseWeight, sessionMuscles, showToast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useSession } from '../../app/App';
import { BusyButton, Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { ConfirmSheet } from '../../components/sheet';
import { BodyMap, ProgressChart } from '../../components/visualizations';

function SetRow({ set, sessionId, plannedId, exerciseId, readOnly }: { set: any; sessionId: number; plannedId: number; exerciseId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch('DELETE', `/sessions/${sessionId}/exercises/${plannedId}/sets/${set.id}`),
    onSuccess: (updated: any) => {
      queryClient.setQueryData(['session', sessionId], updated);
      queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['progress', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['active'] });
      queryClient.invalidateQueries({ queryKey: ['records'] });
      haptic('ok');
      showToast('Serie borrada', 'ok');
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });
  return (
    <div class="flex items-center justify-between gap-2.5 rounded-control bg-surface-2 px-[13px] py-3" key={set.id}>
      <span class="text-[.78rem] text-hint">Serie {set.set_number}</span>
      <span class="flex items-center gap-[9px] text-[.83rem] font-bold">
        {set.reps} reps{formatWeight(set.weight, set.weight_mode) ? ` · ${formatWeight(set.weight, set.weight_mode)}` : ''}
        {!readOnly && (
          <button class="min-h-9 min-w-9 cursor-pointer rounded-pill border-0 bg-transparent text-err disabled:opacity-30" disabled={del.isPending} onClick={() => del.mutate()} aria-label="Borrar serie">
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

export function Exercise({ plannedId }: { plannedId: number }) {
  const app = useApp();
  const sessionQuery = useSession();
  const plan = sessionQuery.data;
  const exercise = plan?.exercises?.find((candidate: any) => String(candidate.planned_id) === String(plannedId));
  const [showPicker, setShowPicker] = useState(false);

  if (sessionQuery.isLoading) return <Loading />;
  if (!exercise)
    return (
      <>
        <TopBar title="Ejercicio" onBack={app.pop} />
        <Empty icon="⚠️">Ejercicio no encontrado.</Empty>
      </>
    );

  const loggedSetCount = completedSetCount(exercise);
  const mediaSrc = mediaUrl(exercise.gif_url || exercise.image_url);
  const muscles = sessionMuscles([exercise]);
  const instructions =
    exercise.instructions_es || exercise.instructions || exercise.notes || 'Sigue las indicaciones del coach en Telegram.';

  return (
    <>
      <TopBar title={plan.title || 'Entrenamiento'} onBack={app.pop} />
      <div class="mx-[3px] mt-2.5 mb-[15px] flex gap-[5px] [&>span]:h-[5px] [&>span]:flex-1 [&>span]:rounded-[9px] [&>span]:bg-track-dim" aria-label={`Serie ${Math.min(loggedSetCount + 1, exercise.sets)} de ${exercise.sets}`}>
        {Array.from({ length: exercise.sets || 0 }, (_, setIndex) => (
          <span key={setIndex} class={setIndex < loggedSetCount ? '!bg-ok-bright' : setIndex === loggedSetCount ? '!bg-accent' : ''} />
        ))}
      </div>
      <div class="my-3 overflow-hidden rounded-card bg-surface shadow-card min-[720px]:grid min-[720px]:grid-cols-[1.12fr_.88fr]">
        {/* Dataset media is 180×180: render at native size, never upscale. */}
        <div class="grid h-[235px] place-items-center bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] min-[720px]:h-auto min-[720px]:min-h-[320px] max-[380px]:h-[210px]">{mediaSrc ? <img class="size-[180px] object-contain" src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="eager" width="180" height="180" /> : '🏋️'}</div>
        <div class="p-[18px] min-[720px]:flex min-[720px]:flex-col min-[720px]:justify-center">
          <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Serie {Math.min(loggedSetCount + 1, exercise.sets)} de {exercise.sets}</p>
          <h1>{exercise.name || 'Ejercicio'}</h1>
          <p>{formatMuscle(exercise.target || exercise.muscle_group || '')}</p>
        </div>
      </div>
      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <h3>Planificación</h3>
        <div class="mt-2 flex flex-wrap gap-1.5">
          {exercise.set_targets?.length ? (
            [...exercise.set_targets]
              .sort((a: any, b: any) => a.set_number - b.set_number)
              .map((target: any) => (
                <span key={target.set_number} class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
                  {formatSetTarget(target, exercise.weight_mode)}
                </span>
              ))
          ) : (
            Array.from({ length: exercise.sets || 0 }, (_, index) => (
              <span key={index + 1} class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
                {formatSetTarget(
                  { set_number: index + 1, weight: exercise.weight ?? null, reps: exercise.reps },
                  exercise.weight_mode,
                )}
              </span>
            ))
          )}
        </div>
      </div>
      {!app.readOnly && exercise.status !== 'completed' && (
        <SetCountControl sessionId={plan.id} plannedId={exercise.planned_id} currentSets={exercise.sets || 0} loggedSets={loggedSetCount} />
      )}
      <ExerciseProgress exerciseId={exercise.exercise_id} />
      {/* Primary action first: log the set right under the exercise, history below. */}
      {/* key={loggedSetCount}: remount per set so inputs re-prefill from the last logged set. */}
      {!app.readOnly && exercise.status !== 'completed' && (
        <LogSetForm key={loggedSetCount} sessionId={plan.id} exercise={exercise} loggedSetCount={loggedSetCount} onShowPicker={() => setShowPicker(true)} />
      )}
      {loggedSetCount > 0 && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Series registradas</h3>
          <div class="mt-2 grid gap-[7px]">
            {(exercise.performed_sets || []).map((performedSet: any) => (
              <SetRow
                key={performedSet.id}
                set={performedSet}
                sessionId={plan.id}
                plannedId={exercise.planned_id}
                exerciseId={exercise.exercise_id}
                readOnly={app.readOnly || plan.status === 'completed'}
              />
            ))}
          </div>
        </div>
      )}
      {!app.readOnly && exercise.status === 'completed' && (
        <div class="my-3 rounded-card bg-surface p-7 text-center shadow-card">
          <div class="mx-auto mb-3 grid size-[52px] place-items-center rounded-full bg-ok-bg text-2xl font-extrabold text-ok">✓</div>
          <h3>Ejercicio completado</h3>
          <button class="mt-2.5 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975]" onClick={app.pop}>
            Volver al plan
          </button>
        </div>
      )}
      <details class="my-3 rounded-card bg-surface p-[18px] shadow-card [&[open]>summary]:mb-2.5">
        <summary>Técnica</summary>
        <p class="whitespace-pre-line">{instructions}</p>
        {exercise.notes && <p class="mt-2">{exercise.notes}</p>}
      </details>
      {muscles.length > 0 && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Músculos trabajados</h3>
          <BodyMap muscles={muscles} />
        </div>
      )}
      {showPicker && (
        <NextExercisePicker
          exercises={plan?.exercises?.filter((e: any) => e.planned_id !== exercise.planned_id && ['pending', 'in_progress'].includes(e.status)) || []}
          onPick={(id) => app.replace({ name: 'exercise', plannedId: id })}
          onDismiss={() => app.pop()}
        />
      )}
    </>
  );
}

function ExerciseProgress({ exerciseId }: { exerciseId: number }) {
  const progressQuery = useQuery({
    queryKey: ['progress', exerciseId],
    queryFn: () => apiFetch<ProgressPoint[]>('GET', `/exercises/${exerciseId}/progress?limit=50`),
  });
  const points = progressQuery.data;
  if (!points || points.length === 0) return null;

  const usesWeight = chartUsesWeight(points);
  const best = usesWeight
    ? Math.max(...points.map((point) => point.top_weight || 0))
    : Math.max(...points.map((point) => point.top_reps || 0));
  const last = points[points.length - 1];
  const lastValue = usesWeight ? (last.top_weight || 0) : (last.top_reps || 0);

  return (
    <>
      <div class="my-2 mt-3 flex items-center rounded-card bg-surface px-[18px] py-[14px] shadow-card">
        <div class="flex-1 text-center">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">🏆 Mejor</span>
          <b>{usesWeight ? `${best} kg` : `${best} reps`}</b>
        </div>
        <div class="mx-3 h-9 w-px bg-edge" />
        <div class="flex-1 text-center">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">⏱ Última</span>
          <b>{usesWeight ? `${lastValue} kg` : `${lastValue} reps`}</b>
        </div>
      </div>
      {points.length >= 2 && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Progresión</h3>
          <p class="text-xs">{usesWeight ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
          <ProgressChart points={points.slice(-12)} />
        </div>
      )}
    </>
  );
}

function SetCountControl({ sessionId, plannedId, currentSets, loggedSets }: { sessionId: number; plannedId: number; currentSets: number; loggedSets: number }) {
  const queryClient = useQueryClient();
  const [sets, setSets] = useState(currentSets);
  const adjust = useMutation({
    mutationFn: (target: number) =>
      apiFetch('PUT', `/sessions/${sessionId}/exercises/${plannedId}`, { target_sets: target }),
    onSuccess: (updated: any) => {
      queryClient.setQueryData(['session', sessionId], updated);
      queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
      haptic('light');
    },
    onError: (error: any) => {
      setSets(currentSets);
      haptic('bad');
      showToast(error.message, 'err');
    },
  });
  const step = (delta: number) => {
    const next = Math.max(loggedSets, Math.min(20, sets + delta));
    if (next === sets) return;
    setSets(next);
    adjust.mutate(next);
  };
  return (
    <div class="my-3 flex items-center justify-between rounded-card bg-surface px-[18px] py-[14px] shadow-card">
      <span class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Series</span>
      <div class="flex items-center gap-3">
        <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.3rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets <= loggedSets} onClick={() => step(-1)} aria-label="Quitar serie">−</button>
        <span class="min-w-8 text-center text-[1.4rem] font-[720] tracking-[-.03em]">{sets}</span>
        <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.3rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets >= 20} onClick={() => step(1)} aria-label="Añadir serie">+</button>
      </div>
    </div>
  );
}

function LogSetForm({
  sessionId,
  exercise,
  loggedSetCount,
  onShowPicker,
}: {
  sessionId: number;
  exercise: any;
  loggedSetCount: number;
  onShowPicker: () => void;
}) {
  const app = useApp();
  const queryClient = useQueryClient();
  // Prefill priority: per-set target > previous performed set > global prescription.
  const nextSetNumber = loggedSetCount + 1;
  const setTarget = exercise.set_targets?.find((t: any) => t.set_number === nextSetNumber);
  const previousSet = exercise.performed_sets?.at(-1);
  // The backend gives bodyweight exercises their fixed sentinel value.
  const isBodyweight = exercise.weight_mode === 'bodyweight';
  const [weight, setWeight] = useState(String(setTarget?.weight ?? previousSet?.weight ?? exercise.weight ?? ''));
  const [reps, setReps] = useState(String(setTarget?.reps ?? previousSet?.reps ?? exercise.reps ?? 10));
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const isLastSet = nextSetNumber >= (exercise.sets || 1);

  const refreshAfterMutation = (updatedSession: any) => {
    queryClient.setQueryData(['session', sessionId], updatedSession);
    queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['progress', exercise.exercise_id] });
    queryClient.invalidateQueries({ queryKey: ['active'] });
    queryClient.invalidateQueries({ queryKey: ['records'] });
  };

  const logSet = useMutation({
    mutationFn: (normalizedWeight: number | null) =>
      apiFetch('POST', `/sessions/${sessionId}/exercises/${exercise.planned_id}/sets`, {
        set_number: loggedSetCount + 1,
        weight: normalizedWeight,
        reps: parseInt(reps || '0'),
        sensation: 'ok',
        notes: '',
      }),
    onSuccess: (updatedSession) => {
      refreshAfterMutation(updatedSession);
      haptic('ok');
      // Last step of the flow: logging the final set also completes the exercise.
      if (isLastSet) completeExercise.mutate();
      else showToast('Serie guardada', 'ok');
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });

  const completeExercise = useMutation({
    mutationFn: () => apiFetch('POST', `/sessions/${sessionId}/exercises/${exercise.planned_id}/complete`),
    onSuccess: (updatedSession: any) => {
      refreshAfterMutation(updatedSession);
      haptic('ok');
      showToast('Ejercicio completado', 'ok');
      const pending = (updatedSession.planned_exercises || []).filter(
        (e: any) => e.id !== exercise.planned_id && ['pending', 'in_progress'].includes(e.status)
      );
      if (pending.length > 0) onShowPicker();
      else app.pop();
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });

  const saveSet = () => {
    if (parseInt(reps || '0') <= 0) {
      showToast('Pon las reps', 'err');
      return;
    }
    if (isBodyweight) {
      logSet.mutate(null);
      return;
    }
    if (weight.trim() === '') {
      logSet.mutate(null);
      return;
    }
    const normalizedWeight = parseWeight(weight);
    if (isNaN(normalizedWeight) || normalizedWeight <= 0) {
      showToast('El peso debe ser mayor que 0; déjalo vacío si no hay carga', 'err');
      return;
    }
    logSet.mutate(normalizedWeight);
  };

  const isBusy = logSet.isPending || completeExercise.isPending;

  return (
    <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
      <div class="flex items-stretch gap-[9px]">
        <div class="min-w-0 flex-1">
          <label for="set-weight">{isBodyweight ? 'Peso corporal' : 'Peso (kg)'}</label>
          <div class="flex items-center gap-1.5">
            {isBodyweight ? (
              <div class="grid min-h-14 min-w-0 flex-1 place-items-center rounded-control bg-surface-2 text-[1.25rem] font-[720] tracking-[-.03em] text-hint">Peso corporal</div>
            ) : (
              <input id="set-weight" type="text" inputmode="decimal" enterkeyhint="done" value={weight} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setWeight(event.target.value)} />
            )}
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <label for="set-reps">Reps</label>
          <div class="flex items-center gap-1.5">
            <input id="set-reps" type="text" inputmode="numeric" enterkeyhint="done" value={reps} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setReps(event.target.value)} />
          </div>
        </div>
      </div>
      <BusyButton busy={isBusy} busyLabel="Guardando..." class="mt-5 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-canvas transition active:scale-[.975] active:opacity-[.82] disabled:pointer-events-none disabled:opacity-35" onClick={saveSet}>
        {isLastSet ? 'Registrar' : 'Continuar'}
      </BusyButton>
      {!isLastSet && (
        <button class="mt-2 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] disabled:pointer-events-none disabled:opacity-35" disabled={isBusy} onClick={() => setConfirmFinishOpen(true)}>
          Terminar ejercicio
        </button>
      )}
      <ConfirmSheet
        open={confirmFinishOpen}
        title="Terminar ejercicio"
        message={`Te quedan ${exercise.sets - loggedSetCount} series por hacer. ¿Terminar igualmente?`}
        confirmLabel="Terminar"
        busy={completeExercise.isPending}
        onConfirm={() => completeExercise.mutate()}
        onCancel={() => setConfirmFinishOpen(false)}
      />
    </div>
  );
}

function NextExercisePicker({ exercises, onPick, onDismiss }: { exercises: any[]; onPick: (plannedId: number) => void; onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return (
    <dialog ref={dialogRef} class="native-sheet m-auto mb-2.5 w-[min(100%-20px,430px)] rounded-[26px] border border-white/50 bg-surface/94 pb-3 text-ink shadow-sheet backdrop-blur-3xl backdrop-saturate-150 [&::backdrop]:bg-black/35" onClose={onDismiss}>
      <div class="mx-auto mb-3 mt-2 h-1 w-9 rounded-pill bg-track" />
      <div class="px-5">
        <h2>Siguiente ejercicio</h2>
        <p class="mt-1 text-hint">Elige el que tengas a mano.</p>
      </div>
      <div class="mt-3 grid gap-2 px-5">
        {exercises.map((exercise: any) => {
          const src = mediaUrl(exercise.image_url || exercise.gif_url);
          return (
            <button key={exercise.planned_id} class="flex cursor-pointer items-center gap-3 rounded-2xl border-0 bg-surface-2 p-3 text-left transition active:scale-[.98]" onClick={() => { dialogRef.current?.close(); onPick(exercise.planned_id); }}>
              <div class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                {src ? <img class="size-full object-contain" src={src} alt="" loading="lazy" /> : '🏋️'}
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="truncate text-[.88rem]">{exercise.name}</h3>
                <p class="text-[.72rem] text-hint">{formatMuscle(exercise.target || '')} · {exercise.sets}×{exercise.reps}</p>
              </div>
            </button>
          );
        })}
      </div>
      <div class="mt-3 px-5">
        <button class="min-h-[46px] w-full cursor-pointer rounded-2xl border-0 bg-transparent font-[680] text-accent transition active:scale-[.975]" onClick={onDismiss}>Ver plan completo</button>
      </div>
    </dialog>
  );
}
