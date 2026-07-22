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

const targetForSet = (exercise: any, setNumber: number) =>
  exercise.set_targets?.find((target: any) => target.set_number === setNumber) || {
    set_number: setNumber,
    weight: exercise.weight ?? null,
    reps: exercise.reps,
  };

const targetValue = (target: any, mode: string) => {
  const weight = formatWeight(target.weight, mode);
  return weight ? `${weight} × ${target.reps}` : `${target.reps} reps`;
};

function SetRow({ set, target, sessionId, plannedId, exerciseId, readOnly }: { set: any; target: any; sessionId: number; plannedId: number; exerciseId: number; readOnly?: boolean }) {
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
  const performed = formatWeight(set.weight, set.weight_mode);
  return (
    <div role="group" aria-label={`Serie ${set.set_number} realizada`} class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control bg-surface-2 px-3 py-2.5">
      <span aria-hidden="true" class="grid size-[30px] place-items-center rounded-pill bg-ok-bg text-[.7rem] font-bold text-ok">S{set.set_number}</span>
      <div class="min-w-0">
        <span class="block truncate text-[.68rem] text-hint">Plan · {targetValue(target, set.weight_mode)}</span>
        <b class="block truncate text-[.84rem]">{performed ? `${performed} × ${set.reps}` : `${set.reps} reps`} · Hecha</b>
      </div>
      {!readOnly && (
        <button class="grid size-10 cursor-pointer place-items-center rounded-pill border-0 bg-transparent text-err disabled:opacity-30" disabled={del.isPending} onClick={() => del.mutate()} aria-label={`Borrar serie ${set.set_number}`}>
          ✕
        </button>
      )}
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
  const showEditor = !app.readOnly && exercise.status !== 'completed';
  const futureStart = loggedSetCount + (showEditor ? 2 : 1);
  const futureCount = Math.max(0, exercise.sets - futureStart + 1);

  return (
    <>
      <TopBar title={plan.title || 'Entrenamiento'} onBack={app.pop} />
      <div class="my-3 overflow-hidden rounded-card bg-surface shadow-card min-[720px]:grid min-[720px]:grid-cols-[1.05fr_.95fr]">
        {/* Dataset media is 180×180: render at native size, never upscale. */}
        <div class="grid h-[200px] place-items-center bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] min-[720px]:h-auto min-[720px]:min-h-[280px]">
          {mediaSrc ? <img class="size-[180px] object-contain" src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="eager" width="180" height="180" /> : '🏋️'}
        </div>
        <div class="p-[18px] min-[720px]:flex min-[720px]:flex-col min-[720px]:justify-center">
          <h1 class="text-[1.55rem]">{exercise.name || 'Ejercicio'}</h1>
          <p class="mt-1">{formatMuscle(exercise.target || exercise.muscle_group || '')}</p>
          <div class="mt-4 flex items-center justify-between text-[.68rem] font-bold tracking-[.05em] text-hint uppercase">
            <span>Progreso</span>
            <span>{loggedSetCount}/{exercise.sets} series</span>
          </div>
          <div class="mt-2 flex gap-[5px] [&>span]:h-[5px] [&>span]:flex-1 [&>span]:rounded-[9px] [&>span]:bg-track-dim" aria-label={`${loggedSetCount} de ${exercise.sets} series completadas`}>
            {Array.from({ length: exercise.sets || 0 }, (_, setIndex) => (
              <span key={setIndex} class={setIndex < loggedSetCount ? '!bg-ok-bright' : setIndex === loggedSetCount && showEditor ? '!bg-accent' : ''} />
            ))}
          </div>
        </div>
      </div>

      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <div class="mb-3 flex min-h-9 items-center justify-between gap-3">
          <h3>Series</h3>
          {showEditor && <SetCountControl sessionId={plan.id} plannedId={exercise.planned_id} currentSets={exercise.sets || 0} loggedSets={loggedSetCount} />}
        </div>
        <div class="grid gap-2">
          {(exercise.performed_sets || []).map((performedSet: any) => (
            <SetRow
              key={performedSet.id}
              set={performedSet}
              target={targetForSet(exercise, performedSet.set_number)}
              sessionId={plan.id}
              plannedId={exercise.planned_id}
              exerciseId={exercise.exercise_id}
              readOnly={app.readOnly || plan.status === 'completed'}
            />
          ))}
          {showEditor && (
            <LogSetForm key={loggedSetCount} sessionId={plan.id} exercise={exercise} loggedSetCount={loggedSetCount} onShowPicker={() => setShowPicker(true)} />
          )}
          {Array.from({ length: futureCount }, (_, index) => {
            const setNumber = futureStart + index;
            return (
              <div key={setNumber} role="group" aria-label={`Serie ${setNumber} pendiente`} class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control bg-surface-2/55 px-3 py-3">
                <span aria-hidden="true" class="grid size-[30px] place-items-center rounded-pill bg-surface-2 text-[.7rem] font-bold text-hint">S{setNumber}</span>
                <div class="min-w-0">
                  <span class="block text-[.68rem] text-hint">Plan</span>
                  <b class="block truncate text-[.84rem] text-ink">{targetValue(targetForSet(exercise, setNumber), exercise.weight_mode)}</b>
                </div>
                <span class="text-[.7rem] font-[650] text-hint">Pendiente</span>
              </div>
            );
          })}
        </div>
        {!app.readOnly && exercise.status === 'completed' && (
          <div class="mt-3 border-t border-edge pt-3 text-center">
            <p class="font-[680] text-ok">✓ Ejercicio completado</p>
            <button class="mt-1 min-h-11 w-full cursor-pointer rounded-2xl border-0 bg-transparent px-4 py-2 text-[.9rem] font-[700] text-accent active:scale-[.975]" onClick={app.pop}>
              Volver al plan
            </button>
          </div>
        )}
      </div>

      <ExerciseProgress exerciseId={exercise.exercise_id} />

      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <h3>Sobre el ejercicio</h3>
        <details class="mt-2 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
          <summary>Técnica</summary>
          <p class="whitespace-pre-line">{instructions}</p>
          {exercise.notes && <p class="mt-2">{exercise.notes}</p>}
        </details>
        {muscles.length > 0 && (
          <details class="mt-1 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
            <summary>Músculos trabajados</summary>
            <BodyMap muscles={muscles} />
          </details>
        )}
      </div>
      {showPicker && (
        <NextExercisePicker
          exercises={plan?.exercises?.filter((e: any) => e.planned_id !== exercise.planned_id && ['pending', 'in_progress'].includes(e.status)) || []}
          onPick={(id) => {
            setShowPicker(false);
            app.replace({ name: 'exercise', plannedId: id });
          }}
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
    <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
      <h3>Marcas</h3>
      <div class="mt-3 flex items-center">
        <div class="flex-1">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.06em] text-hint uppercase">Mejor</span>
          <b class="text-[1.05rem]">{usesWeight ? `${best} kg` : `${best} reps`}</b>
        </div>
        <div class="mx-4 h-9 w-px bg-edge" />
        <div class="flex-1">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.06em] text-hint uppercase">Última</span>
          <b class="text-[1.05rem]">{usesWeight ? `${lastValue} kg` : `${lastValue} reps`}</b>
        </div>
      </div>
      {points.length >= 2 && (
        <details class="mt-3 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
          <summary>Ver progresión</summary>
          <p class="text-xs">{usesWeight ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
          <ProgressChart points={points.slice(-12)} />
        </details>
      )}
    </div>
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
    const next = Math.max(1, loggedSets, Math.min(20, sets + delta));
    if (next === sets) return;
    setSets(next);
    adjust.mutate(next);
  };
  return (
    <div class="flex items-center gap-2" aria-label={`${sets} series planificadas`}>
      <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.2rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets <= loggedSets} onClick={() => step(-1)} aria-label="Quitar serie">−</button>
      <span class="min-w-6 text-center text-[1.05rem] font-[720] tracking-[-.03em]">{sets}</span>
      <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.2rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets >= 20} onClick={() => step(1)} aria-label="Añadir serie">+</button>
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
  const explicitTarget = exercise.set_targets?.find((target: any) => target.set_number === nextSetNumber);
  const setTarget = targetForSet(exercise, nextSetNumber);
  const previousSet = exercise.performed_sets?.at(-1);
  // The backend gives bodyweight exercises their fixed sentinel value.
  const isBodyweight = exercise.weight_mode === 'bodyweight';
  const [weight, setWeight] = useState(String(explicitTarget?.weight ?? previousSet?.weight ?? exercise.weight ?? ''));
  const [reps, setReps] = useState(String(explicitTarget?.reps ?? previousSet?.reps ?? exercise.reps ?? 10));
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const isLastSet = nextSetNumber >= (exercise.sets || 1);
  const remainingSets = exercise.sets - loggedSetCount;

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
    <div role="group" aria-label={`Serie ${nextSetNumber} en curso`} class="rounded-control border border-accent/20 bg-accent-bg/55 p-3">
      <div class="mb-3 grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5">
        <span aria-hidden="true" class="grid size-[30px] place-items-center rounded-pill bg-accent text-[.7rem] font-bold text-white">S{nextSetNumber}</span>
        <div class="min-w-0">
          <span class="block text-[.68rem] font-bold tracking-[.05em] text-accent uppercase">En curso</span>
          <b class="block truncate text-[.84rem]">Plan · {targetValue(setTarget, exercise.weight_mode)}</b>
        </div>
      </div>
      <div class="flex items-stretch gap-[9px]">
        <div class="min-w-0 flex-1">
          <label for="set-weight">{isBodyweight ? 'Peso corporal' : 'Peso (kg)'}</label>
          <div class="flex items-center gap-1.5">
            {isBodyweight ? (
              <div class="grid min-h-14 min-w-0 flex-1 place-items-center rounded-control bg-surface text-[1rem] font-[720] tracking-[-.03em] text-hint">Corporal</div>
            ) : (
              <input id="set-weight" class="bg-surface" type="text" inputmode="decimal" enterkeyhint="done" value={weight} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setWeight(event.target.value)} />
            )}
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <label for="set-reps">Reps</label>
          <div class="flex items-center gap-1.5">
            <input id="set-reps" class="bg-surface" type="text" inputmode="numeric" enterkeyhint="done" value={reps} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setReps(event.target.value)} />
          </div>
        </div>
      </div>
      <BusyButton busy={isBusy} busyLabel="Guardando..." class="mt-4 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-canvas transition active:scale-[.975] active:opacity-[.82] disabled:pointer-events-none disabled:opacity-35" onClick={saveSet}>
        {isLastSet ? 'Registrar y terminar' : 'Registrar serie'}
      </BusyButton>
      {!isLastSet && (
        <button class="mt-1 min-h-11 w-full cursor-pointer rounded-2xl border-0 bg-transparent px-4 py-2 text-[.88rem] font-[700] text-accent transition active:scale-[.975] disabled:pointer-events-none disabled:opacity-35" disabled={isBusy} onClick={() => setConfirmFinishOpen(true)}>
          Terminar ejercicio
        </button>
      )}
      <ConfirmSheet
        open={confirmFinishOpen}
        title="Terminar ejercicio"
        message={`Te ${remainingSets === 1 ? 'queda 1 serie' : `quedan ${remainingSets} series`} por hacer. ¿Terminar igualmente?`}
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
    <dialog ref={dialogRef} class="native-sheet m-auto mb-2.5 w-[min(100%-20px,430px)] rounded-[26px] border border-white/50 bg-surface/94 p-5 text-ink shadow-sheet backdrop-blur-3xl backdrop-saturate-150 [&::backdrop]:bg-black/35" onClose={onDismiss}>
      <div class="mx-auto mb-4 h-1 w-9 rounded-pill bg-track" />
      <h2>Siguiente ejercicio</h2>
      <p class="mt-1 text-hint">Elige el que tengas a mano.</p>
      <div class="mt-4 grid gap-2">
        {exercises.map((exercise: any) => {
          const src = mediaUrl(exercise.image_url || exercise.gif_url);
          return (
            <button key={exercise.planned_id} class="grid w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border-0 bg-surface-2 p-3 text-left transition active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onPick(exercise.planned_id)}>
              <div class="grid size-12 place-items-center overflow-hidden rounded-xl bg-white text-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                {src ? <img class="size-full object-contain" src={src} alt="" loading="lazy" /> : '🏋️'}
              </div>
              <div class="min-w-0">
                <h3 class="truncate text-[.88rem]">{exercise.name}</h3>
                <p class="text-[.72rem] text-hint">{formatMuscle(exercise.target || '')} · {exercise.sets}×{exercise.reps}</p>
              </div>
              <span aria-hidden="true" class="text-lg text-hint">›</span>
            </button>
          );
        })}
      </div>
      <div class="mt-4 border-t border-edge pt-3">
        <button class="min-h-[46px] w-full cursor-pointer rounded-2xl border-0 bg-transparent font-[680] text-accent transition active:scale-[.975]" onClick={onDismiss}>Ver plan completo</button>
      </div>
    </dialog>
  );
}
