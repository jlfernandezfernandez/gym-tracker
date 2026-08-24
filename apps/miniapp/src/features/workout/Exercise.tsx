import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { progressMetric, progressUnit, progressValue, type ProgressPoint } from '../../lib/chart';
import {
  canEditWorkout,
  completedSetCount,
  executionMetricPayload,
  formatMuscle,
  formatWeight,
  mediaUrl,
  missingSetNumbers,
  parseWeight,
  sessionMuscles,
  showToast,
} from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useWakeLock } from '../../lib/wakelock';
import { useApp, useSession } from '../../app/App';
import { BusyButton, Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { RestTimer } from '../../components/RestTimer';
import { ConfirmSheet } from '../../components/sheet';
import { BodyMap, ProgressChart, SetProgress } from '../../components/visualizations';

export function formatTimerDisplay(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function isTimedOrIsometricExercise(exercise: any): boolean {
  if (!exercise) return false;
  if (exercise.activity_type === 'timed' || exercise.activity_type === 'isometric') return true;
  if (exercise.is_isometric === true || exercise.is_timed === true) return true;
  if (exercise.mode === 'time' || exercise.mode === 'timed') return true;

  const text = [
    exercise.name,
    exercise.name_en,
    exercise.name_es,
    exercise.notes,
    exercise.instructions,
    exercise.instructions_es,
    exercise.target,
    exercise.body_part,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isometricKeywords = [
    'plank',
    'plancha',
    'dead hang',
    'colgado',
    'wall sit',
    'sentadilla isométrica',
    'sentadilla isometrica',
    'farmer',
    'paseo del granjero',
    'carry',
    'hold',
    'isométrico',
    'isometrico',
    'isometric',
    'hollow hold',
    'l-sit',
    'v-sit',
    'isometria',
    'isometría',
  ];

  return isometricKeywords.some((keyword) => text.includes(keyword));
}

const targetForSet = (exercise: any, setNumber: number) =>
  exercise.set_targets?.find((target: any) => target.set_number === setNumber) || {
    set_number: setNumber,
    weight: exercise.weight ?? null,
    reps: exercise.reps,
    duration_minutes: exercise.duration_minutes,
    duration_seconds: exercise.duration_seconds ?? (isTimedOrIsometricExercise(exercise) ? exercise.reps : undefined),
    is_warmup: false,
  };

export const targetValue = (target: any, exercise: any) => {
  if (exercise?.activity_type === 'cardio') return `${target.duration_minutes} min`;
  const isTimed = isTimedOrIsometricExercise(exercise) || isTimedOrIsometricExercise(target);
  const weight = formatWeight(target.weight, exercise?.weight_mode ?? target?.weight_mode);
  if (isTimed) {
    const sec = target.duration_seconds ?? (target.reps ?? (target.duration_minutes ? target.duration_minutes * 60 : 30));
    return weight ? `${weight} × ${sec}s` : `${sec}s`;
  }
  return weight ? `${weight} × ${target.reps}` : `${target.reps} reps`;
};

function refreshWorkoutQueries(queryClient: any, sessionId: number, updatedSession: any, exerciseId?: number) {
  queryClient.setQueryData(['session', sessionId], updatedSession);
  queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
  queryClient.invalidateQueries({ queryKey: ['active'] });
  queryClient.invalidateQueries({ queryKey: ['sessions'] });
  queryClient.invalidateQueries({ queryKey: ['records'] });
  if (exerciseId) queryClient.invalidateQueries({ queryKey: ['progress', exerciseId] });
}

export function SetRow({ set, target, sessionId, plannedId, exerciseId, activityType, isTimed, unilateral, readOnly }: { set: any; target: any; sessionId: number; plannedId: number; exerciseId: number; activityType: string; isTimed?: boolean; unilateral?: boolean; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch('DELETE', `/sessions/${sessionId}/exercises/${plannedId}/sets/${set.id}`),
    onSuccess: (updated: any) => {
      refreshWorkoutQueries(queryClient, sessionId, updated, exerciseId);
      haptic('ok');
      showToast('Serie borrada', 'ok', 'Deshacer', () => restore.mutate());
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });
  const restore = useMutation({
    mutationFn: () =>
      apiFetch('POST', `/sessions/${sessionId}/exercises/${plannedId}/sets/restore`, {
        set_number: set.set_number,
        ...executionMetricPayload(activityType as 'strength' | 'cardio', set),
        is_warmup: set.is_warmup || false,
        rpe: set.rpe,
        rir: set.rir,
        sensation: set.sensation,
        notes: set.notes,
      }),
    onSuccess: (updated: any) => {
      refreshWorkoutQueries(queryClient, sessionId, updated, exerciseId);
      haptic('ok');
      showToast('Serie restaurada', 'ok');
    },
    onError: (error: any) => showToast(error.message, 'err'),
  });
  const performed = formatWeight(set.weight, set.weight_mode);
  const isWarmup = !!set.is_warmup;
  const effortLabel = set.rir !== undefined && set.rir !== null ? ` · RIR ${set.rir}` : set.rpe ? ` · RPE ${set.rpe}` : '';
  const timedExercise = isTimed ?? isTimedOrIsometricExercise({ activity_type: activityType, ...target, ...set });

  return (
    <div role="group" aria-label={`Serie ${set.set_number} realizada`} class={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control px-3 py-2.5 ${isWarmup ? 'bg-amber-500/10 border border-amber-500/25' : 'bg-surface-2'}`}>
      <span aria-hidden="true" class={`grid size-[30px] place-items-center rounded-pill text-[.7rem] font-bold ${isWarmup ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-ok-bg text-ok'}`}>
        {isWarmup ? 'W' : `S${set.set_number}`}
      </span>
      <div class="min-w-0">
        <span class="block truncate text-[.68rem] text-hint">
          {isWarmup ? 'Calentamiento' : `Plan · ${targetValue(target, { activity_type: activityType, weight_mode: set.weight_mode, is_isometric: timedExercise })}`}{unilateral ? ' · Unilateral' : ''}
        </span>
        <b class="block truncate text-[.84rem]">
          {activityType === 'cardio'
            ? `${set.duration_minutes} min`
            : timedExercise
            ? performed ? `${performed} × ${set.reps ?? set.duration_seconds}s` : `${set.reps ?? set.duration_seconds}s`
            : performed ? `${performed} × ${set.reps}` : `${set.reps} reps`}
          {effortLabel} · Hecha
        </b>
      </div>
      {!readOnly && (
        <button class="grid size-10 cursor-pointer place-items-center rounded-pill border-0 bg-transparent text-err disabled:opacity-30" disabled={del.isPending || restore.isPending} onClick={() => {
          if (window.confirm(`¿Borrar la serie ${set.set_number}? Puedes deshacerlo durante unos segundos.`)) del.mutate();
        }} aria-label={`Borrar serie ${set.set_number}`}>
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
  const [showRestTimer, setShowRestTimer] = useState(false);

  // Keep screen on during training session
  useWakeLock(!app.readOnly && (plan?.status === 'in_progress' || plan?.status === 'planned'));

  if (sessionQuery.isLoading) return <Loading />;
  if (!exercise)
    return (
      <>
        <TopBar title="Ejercicio" onBack={app.pop} />
        <Empty icon="⚠️">Ejercicio no encontrado.</Empty>
      </>
    );

  const loggedSetCount = completedSetCount(exercise);
  const performedSetNumbers = new Set<number>((exercise.performed_sets || []).map((set: any) => set.set_number));
  const missingSets = missingSetNumbers(exercise);
  const currentSetNumber = missingSets[0];
  const mediaSrc = mediaUrl(exercise.gif_url || exercise.image_url);
  const muscles = sessionMuscles([exercise]);
  const instructions =
    exercise.instructions_es || exercise.instructions || exercise.notes || 'Sigue las indicaciones del coach en Telegram.';
  const showEditor = canEditWorkout(app.readOnly, plan.status, exercise.status) && currentSetNumber !== undefined;
  const futureSetNumbers = missingSets.filter((setNumber) => setNumber !== currentSetNumber);

  return (
    <>
      <TopBar title={plan.title || 'Entrenamiento'} onBack={app.pop} />
      <div class="my-3 overflow-hidden rounded-card bg-surface shadow-card min-[720px]:grid min-[720px]:grid-cols-[1.05fr_.95fr]">
        {/* Dataset media is 180×180: render at native size, never upscale. */}
        <div class="grid h-[200px] place-items-center bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] min-[720px]:h-auto min-[720px]:min-h-[280px]">
          {mediaSrc ? <img class="size-[180px] object-contain" src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="eager" width="180" height="180" /> : '🏋️'}
        </div>
        <div class="p-[18px] min-[720px]:flex min-[720px]:flex-col min-[720px]:justify-center">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-[1.55rem]">{exercise.name || 'Ejercicio'}</h1>
            {exercise.superset_group && (
              <span class="rounded-pill bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                ⚡ Superserie {exercise.superset_group}
              </span>
            )}
          </div>
          <p class="mt-1">{formatMuscle(exercise.target || exercise.muscle_group || '')}{exercise.unilateral ? ' · Unilateral' : ''}</p>
          <div class="mt-4 flex items-center justify-between text-[.68rem] font-bold tracking-[.05em] text-hint uppercase">
            <span>Progreso</span>
            <span>{loggedSetCount}/{exercise.sets} series</span>
          </div>
          <div class="mt-2">
            <SetProgress total={exercise.sets || 0} completedSetNumbers={performedSetNumbers} currentSetNumber={currentSetNumber} showCurrent={showEditor} ariaLabel={`${loggedSetCount} de ${exercise.sets} series completadas`} />
          </div>
        </div>
      </div>

      {showRestTimer && (
        <RestTimer initialSeconds={90} onDismiss={() => setShowRestTimer(false)} />
      )}

      <div class="card">
        <div class="mb-3 flex min-h-9 items-center justify-between gap-3">
          <h3>Series</h3>
          {showEditor && <SetCountControl sessionId={plan.id} plannedId={exercise.planned_id} currentSets={exercise.sets || 0} minimumSets={Math.max(...performedSetNumbers, 0)} />}
        </div>
        <div class="grid gap-2">
          {[...(exercise.performed_sets || [])].sort((first: any, second: any) => first.set_number - second.set_number).map((performedSet: any) => (
            <SetRow
              key={performedSet.id}
              set={performedSet}
              target={targetForSet(exercise, performedSet.set_number)}
              sessionId={plan.id}
              plannedId={exercise.planned_id}
              exerciseId={exercise.exercise_id}
              activityType={exercise.activity_type}
              isTimed={isTimedOrIsometricExercise(exercise)}
              unilateral={exercise.unilateral}
              readOnly={app.readOnly || plan.status === 'completed'}
            />
          ))}
          {showEditor && currentSetNumber !== undefined && (
            <LogSetForm
              key={currentSetNumber}
              sessionId={plan.id}
              exercise={exercise}
              nextSetNumber={currentSetNumber}
              remainingSetCount={missingSets.length}
              onShowPicker={() => setShowPicker(true)}
              onSetDone={() => setShowRestTimer(true)}
            />
          )}
          {futureSetNumbers.map((setNumber) => {
            return (
              <div key={setNumber} role="group" aria-label={`Serie ${setNumber} pendiente`} class="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control bg-surface-2/55 px-3 py-3">
                <span aria-hidden="true" class="grid size-[30px] place-items-center rounded-pill bg-surface-2 text-[.7rem] font-bold text-hint">S{setNumber}</span>
                <div class="min-w-0">
                  <b class="block truncate text-[.84rem] text-ink">{targetValue(targetForSet(exercise, setNumber), exercise)}{exercise.unilateral ? ' · Unilateral' : ''}</b>
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

      <div class="card">
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
  const app = useApp();
  const progressQuery = useQuery({
    queryKey: ['progress', exerciseId],
    queryFn: () => apiFetch<any[]>('GET', `/exercises/${exerciseId}/progress?limit=50`),
    enabled: !app.readOnly,
  });
  const points = progressQuery.data;
  if (!points || points.length === 0) return null;
  const metric = progressMetric(points);
  const unit = progressUnit(metric);
  const best = Math.max(...points.map((point) => progressValue(point, metric)));
  const lastValue = progressValue(points[points.length - 1], metric);
  const best1RM = Math.max(...points.map((p) => p.estimated_1rm || 0), 0);

  return (
    <div class="card">
      <div class="flex items-center justify-between">
        <h3>Marcas</h3>
        {best1RM > 0 && (
          <span class="rounded-pill bg-ok-bg px-2.5 py-0.5 text-xs font-bold text-ok">
            🏆 1RM Est.: {best1RM} kg
          </span>
        )}
      </div>
      <div class="mt-3 flex items-center">
        <div class="flex-1">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.06em] text-hint uppercase">Mejor</span>
          <b class="text-[1.05rem]">{best} {unit}</b>
        </div>
        <div class="mx-4 h-9 w-px bg-edge" />
        <div class="flex-1">
          <span class="mb-1 block text-[.68rem] font-bold tracking-[.06em] text-hint uppercase">Última</span>
          <b class="text-[1.05rem]">{lastValue} {unit}</b>
        </div>
      </div>
      {points.length >= 2 && (
        <details class="mt-3 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
          <summary>Ver progresión</summary>
          <p class="text-xs">{metric === 'minutes' ? 'Minutos máximos por sesión' : metric === 'weight' ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
          <ProgressChart points={points.slice(-12)} />
        </details>
      )}
    </div>
  );
}

function SetCountControl({ sessionId, plannedId, currentSets, minimumSets }: { sessionId: number; plannedId: number; currentSets: number; minimumSets: number }) {
  const queryClient = useQueryClient();
  const [sets, setSets] = useState(currentSets);
  useEffect(() => setSets(currentSets), [currentSets]);
  const adjust = useMutation({
    mutationFn: (target: number) =>
      apiFetch('PUT', `/sessions/${sessionId}/exercises/${plannedId}`, { target_sets: target }),
    onSuccess: (updated: any) => {
      refreshWorkoutQueries(queryClient, sessionId, updated);
      haptic('light');
    },
    onError: (error: any) => {
      setSets(currentSets);
      haptic('bad');
      showToast(error.message, 'err');
    },
  });
  const step = (delta: number) => {
    const next = Math.max(1, minimumSets, Math.min(20, sets + delta));
    if (next === sets) return;
    setSets(next);
    adjust.mutate(next);
  };
  return (
    <div class="flex items-center gap-2" aria-label={`${sets} series planificadas`}>
      <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.2rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets <= minimumSets} onClick={() => step(-1)} aria-label="Quitar serie">−</button>
      <span class="min-w-6 text-center text-[1.05rem] font-[720] tracking-[-.03em]">{sets}</span>
      <button class="grid size-9 cursor-pointer place-items-center rounded-xl border-0 bg-surface-2 text-[1.2rem] font-bold text-ink transition active:scale-90 active:bg-hover disabled:cursor-default disabled:opacity-30" disabled={adjust.isPending || sets >= 20} onClick={() => step(1)} aria-label="Añadir serie">+</button>
    </div>
  );
}

export function IsometricTimer({
  targetSeconds,
  onFinish,
  onStopEarly,
  onAdjustTime,
}: {
  targetSeconds: number;
  onFinish?: (elapsed: number) => void;
  onStopEarly?: (elapsed: number) => void;
  onAdjustTime?: (delta: number) => void;
}) {
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (timerState !== 'running') return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= targetSeconds) {
          setTimerState('finished');
          haptic('ok');
          onFinish?.(targetSeconds);
          return targetSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerState, targetSeconds, onFinish]);

  const handleStart = () => {
    haptic('light');
    if (timerState === 'finished') {
      setElapsedSec(0);
    }
    setTimerState('running');
  };

  const handlePause = () => {
    haptic('light');
    setTimerState('paused');
  };

  const handleReset = () => {
    haptic('light');
    setTimerState('idle');
    setElapsedSec(0);
  };

  const handleStop = () => {
    haptic('ok');
    const actualHeld = Math.max(1, elapsedSec);
    setTimerState('paused');
    onStopEarly?.(actualHeld);
  };

  const handleAdjust = (delta: number) => {
    haptic('light');
    onAdjustTime?.(delta);
  };

  const remainingSec = Math.max(0, targetSeconds - elapsedSec);
  const progressPct = targetSeconds > 0 ? Math.min(100, (elapsedSec / targetSeconds) * 100) : 0;
  const displaySeconds = timerState === 'finished' ? targetSeconds : remainingSec;

  return (
    <div role="region" aria-label="Cronómetro isométrico" class="my-3 rounded-2xl border border-accent/25 bg-surface p-3.5 shadow-sm">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class={`grid size-7 place-items-center rounded-pill text-xs ${
              timerState === 'running' ? 'bg-ok-bg text-ok animate-pulse' : 'bg-accent/15 text-accent'
            }`}
          >
            ⏱️
          </span>
          <div>
            <h4 class="text-xs font-bold text-ink">
              {timerState === 'running'
                ? 'Manteniendo posición...'
                : timerState === 'paused'
                ? 'Temporizador pausado'
                : timerState === 'finished'
                ? '¡Objetivo completado!'
                : 'Cronómetro isométrico'}
            </h4>
            <p class="text-[0.68rem] text-hint">
              {timerState === 'running' || timerState === 'paused'
                ? `${elapsedSec}s completados · ${remainingSec}s restantes`
                : `Objetivo: ${targetSeconds}s`}
            </p>
          </div>
        </div>
        {timerState !== 'idle' && (
          <button
            type="button"
            class="grid size-7 cursor-pointer place-items-center rounded-pill border-0 bg-surface-2 text-xs text-hint hover:text-ink"
            onClick={handleReset}
            aria-label="Reiniciar cronómetro"
            title="Reiniciar"
          >
            ↺
          </button>
        )}
      </div>

      <div class="my-2.5 flex flex-col items-center justify-center">
        <div class="font-mono text-3xl font-extrabold tracking-tight text-accent">
          {formatTimerDisplay(displaySeconds)}
        </div>
        <div class="text-[0.7rem] font-semibold text-hint">
          {timerState === 'running' ? `Transcurrido: ${elapsedSec}s` : `${targetSeconds} segundos`}
        </div>
      </div>

      {/* Progress track */}
      <div class="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
        <div
          class="h-full rounded-pill bg-accent transition-all duration-300 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Quick adjustments & Controls */}
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="cursor-pointer rounded-pill border-0 bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition active:scale-95 hover:bg-hover"
            onClick={() => handleAdjust(10)}
            aria-label="Añadir 10 segundos"
          >
            +10s
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-pill border-0 bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition active:scale-95 hover:bg-hover"
            onClick={() => handleAdjust(30)}
            aria-label="Añadir 30 segundos"
          >
            +30s
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          {timerState === 'idle' && (
            <button
              type="button"
              class="cursor-pointer rounded-pill border-0 bg-accent px-4 py-1 text-xs font-bold text-white transition active:scale-95"
              onClick={handleStart}
              aria-label="Iniciar cronómetro"
            >
              ▶ Iniciar
            </button>
          )}
          {timerState === 'running' && (
            <>
              <button
                type="button"
                class="cursor-pointer rounded-pill border-0 bg-surface-2 px-3 py-1 text-xs font-bold text-ink transition active:scale-95"
                onClick={handlePause}
                aria-label="Pausar cronómetro"
              >
                ⏸ Pausar
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-pill border-0 bg-accent px-3 py-1 text-xs font-bold text-white transition active:scale-95"
                onClick={handleStop}
                aria-label="Parar y registrar tiempo actual"
              >
                ✓ Parar ({elapsedSec}s)
              </button>
            </>
          )}
          {timerState === 'paused' && (
            <>
              <button
                type="button"
                class="cursor-pointer rounded-pill border-0 bg-accent px-3 py-1 text-xs font-bold text-white transition active:scale-95"
                onClick={handleStart}
                aria-label="Reanudar cronómetro"
              >
                ▶ Reanudar
              </button>
              {elapsedSec > 0 && (
                <button
                  type="button"
                  class="cursor-pointer rounded-pill border-0 bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink transition active:scale-95"
                  onClick={handleStop}
                  aria-label="Usar tiempo transcurrido"
                >
                  Usar {elapsedSec}s
                </button>
              )}
            </>
          )}
          {timerState === 'finished' && (
            <button
              type="button"
              class="cursor-pointer rounded-pill border-0 bg-surface-2 px-3 py-1 text-xs font-bold text-ink transition active:scale-95"
              onClick={handleReset}
              aria-label="Reiniciar cronómetro"
            >
              ↺ Repetir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LogSetForm({
  sessionId,
  exercise,
  nextSetNumber,
  remainingSetCount,
  onShowPicker,
  onSetDone,
}: {
  sessionId: number;
  exercise: any;
  nextSetNumber: number;
  remainingSetCount: number;
  onShowPicker: () => void;
  onSetDone?: () => void;
}) {
  const app = useApp();
  const queryClient = useQueryClient();
  const isTimed = isTimedOrIsometricExercise(exercise);
  // Prefill priority: per-set target > previous performed set > global prescription.
  const explicitTarget = exercise.set_targets?.find((target: any) => target.set_number === nextSetNumber);
  const setTarget = targetForSet(exercise, nextSetNumber);
  const previousSet = [...(exercise.performed_sets || [])].sort(
    (first: any, second: any) => second.set_number - first.set_number,
  )[0];
  const isBodyweight = exercise.weight_mode === 'bodyweight';
  const isCardio = exercise.activity_type === 'cardio';

  const initialTimedSeconds =
    explicitTarget?.duration_seconds ??
    explicitTarget?.reps ??
    previousSet?.reps ??
    previousSet?.duration_seconds ??
    (exercise.duration_minutes ? exercise.duration_minutes * 60 : null) ??
    exercise.reps ??
    exercise.target_duration_seconds ??
    30;

  const [weight, setWeight] = useState(String(explicitTarget?.weight ?? previousSet?.weight ?? exercise.weight ?? ''));
  const [reps, setReps] = useState(
    String(
      isTimed
        ? initialTimedSeconds
        : (explicitTarget?.reps ?? previousSet?.reps ?? exercise.reps ?? '')
    )
  );
  const [durationMinutes, setDurationMinutes] = useState(String(explicitTarget?.duration_minutes ?? previousSet?.duration_minutes ?? exercise.duration_minutes ?? ''));
  const [isWarmup, setIsWarmup] = useState(explicitTarget?.is_warmup || false);
  const [selectedRir, setSelectedRir] = useState<number | null>(null);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const isLastSet = remainingSetCount === 1;
  const remainingSets = remainingSetCount;

  const refreshAfterMutation = (updatedSession: any) => {
    refreshWorkoutQueries(queryClient, sessionId, updatedSession, exercise.exercise_id);
  };

  const logSet = useMutation({
    mutationFn: ({ normalizedWeight, metricReps, metricMinutes }: { normalizedWeight: number | null; metricReps?: number; metricMinutes?: number }) =>
      apiFetch('POST', `/sessions/${sessionId}/exercises/${exercise.planned_id}/sets`, {
        set_number: nextSetNumber,
        ...executionMetricPayload(exercise.activity_type, {
          duration_minutes: metricMinutes ?? parseInt(durationMinutes || '0', 10),
          weight: normalizedWeight,
          reps: metricReps ?? parseInt(reps || '0', 10),
        }),
        is_warmup: isWarmup,
        rir: selectedRir,
        rpe: selectedRir !== null ? Math.max(1, 10 - selectedRir) : null,
        sensation: 'ok',
        notes: '',
      }),
    onSuccess: (updatedSession) => {
      refreshAfterMutation(updatedSession);
      haptic('ok');
      if (isLastSet) {
        showToast('Ejercicio completado', 'ok');
        const pending = (updatedSession.planned_exercises || []).filter(
          (candidate: any) => candidate.id !== exercise.planned_id && ['pending', 'in_progress'].includes(candidate.status)
        );
        if (pending.length > 0) onShowPicker();
        else app.pop();
      } else {
        showToast('Serie guardada', 'ok');
        onSetDone?.();
      }
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
      setConfirmFinishOpen(false);
      const pending = (updatedSession.planned_exercises || []).filter(
        (candidate: any) => candidate.id !== exercise.planned_id && ['pending', 'in_progress'].includes(candidate.status)
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
    if (isCardio) {
      const minutes = parseInt(durationMinutes || '0', 10);
      if (minutes <= 0) {
        showToast('Pon los minutos', 'err');
        return;
      }
      logSet.mutate({ normalizedWeight: null, metricMinutes: minutes });
      return;
    }

    const numericReps = parseInt(reps || '0', 10);
    if (numericReps <= 0) {
      showToast(isTimed ? 'Pon los segundos' : 'Pon las reps', 'err');
      return;
    }

    if (isBodyweight || weight.trim() === '') {
      logSet.mutate({ normalizedWeight: null, metricReps: numericReps });
      return;
    }

    const normalizedWeight = parseWeight(weight);
    if (isNaN(normalizedWeight) || normalizedWeight <= 0) {
      showToast('El peso debe ser mayor que 0; déjalo vacío si no hay carga', 'err');
      return;
    }
    logSet.mutate({ normalizedWeight, metricReps: numericReps });
  };

  const isBusy = logSet.isPending || completeExercise.isPending;

  return (
    <div role="group" aria-label={`Serie ${nextSetNumber} en curso`} class="rounded-control border border-accent/20 bg-accent-bg/55 p-3">
      <div class="mb-3 grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5">
        <span aria-hidden="true" class={`grid size-[30px] place-items-center rounded-pill text-[.7rem] font-bold text-white ${isWarmup ? 'bg-amber-500' : 'bg-accent'}`}>
          {isWarmup ? 'W' : `S${nextSetNumber}`}
        </span>
        <div class="min-w-0">
          <span class="block text-[.68rem] font-bold tracking-[.05em] text-accent uppercase">
            {isWarmup ? 'Calentamiento' : 'En curso'}
          </span>
          <b class="block truncate text-[.84rem]">Plan · {targetValue(setTarget, exercise)}{exercise.unilateral ? ' · Unilateral' : ''}</b>
        </div>
      </div>
      {isCardio ? (
        <div>
          <label for="set-duration">Minutos</label>
          <input id="set-duration" class="bg-surface" type="text" inputmode="numeric" enterkeyhint="done" value={durationMinutes} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setDurationMinutes(event.target.value)} />
        </div>
      ) : (
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
            <label for="set-reps">{isTimed ? 'Segundos (s)' : 'Reps'}</label>
            <div class="flex items-center gap-1.5">
              <input id="set-reps" class="bg-surface" type="text" inputmode="numeric" enterkeyhint="done" value={reps} onFocus={(event: any) => event.target.select()} onInput={(event: any) => setReps(event.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Live Stopwatch & Timed Isometric Controls */}
      {isTimed && (
        <IsometricTimer
          targetSeconds={Math.max(1, parseInt(reps || '0', 10) || 30)}
          onFinish={(elapsed) => {
            setReps(String(elapsed));
          }}
          onStopEarly={(elapsed) => {
            setReps(String(elapsed));
            showToast(`Tiempo registrado: ${elapsed}s`, 'ok');
          }}
          onAdjustTime={(delta) => {
            const current = Math.max(5, (parseInt(reps || '0', 10) || 30) + delta);
            setReps(String(current));
          }}
        />
      )}

      {/* Warm-up & RIR Effort Controls */}
      <div class="mt-3 flex items-center justify-between gap-2 border-t border-accent/15 pt-2.5">
        <label class="flex items-center gap-2 text-xs font-semibold text-hint cursor-pointer">
          <input
            type="checkbox"
            checked={isWarmup}
            onChange={(e: any) => setIsWarmup(e.target.checked)}
            class="rounded accent-accent"
          />
          Serie de calentamiento
        </label>
      </div>

      {!isCardio && !isWarmup && (
        <div class="mt-2.5">
          <span class="mb-1.5 block text-[0.68rem] font-bold text-hint uppercase tracking-wider">
            Esfuerzo (RIR / Reps en recámara)
          </span>
          <div class="grid grid-cols-4 gap-1.5">
            {[
              { rir: 0, label: '0 (Fallo)' },
              { rir: 1, label: '1 RIR' },
              { rir: 2, label: '2 RIR' },
              { rir: 3, label: '3+ RIR' },
            ].map((option) => (
              <button
                key={option.rir}
                type="button"
                class={`cursor-pointer rounded-xl border py-1.5 text-center text-xs font-bold transition active:scale-95 ${
                  selectedRir === option.rir
                    ? 'border-accent bg-accent text-white'
                    : 'border-edge bg-surface-2 text-hint hover:text-ink'
                }`}
                onClick={() => setSelectedRir(selectedRir === option.rir ? null : option.rir)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <BusyButton busy={isBusy} busyLabel="Guardando..." class="btn-primary mt-4 bg-ink text-canvas disabled:pointer-events-none disabled:opacity-35" onClick={saveSet}>
        {isLastSet ? 'Registrar' : 'Continuar'}
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
          const isTimed = isTimedOrIsometricExercise(exercise);
          return (
            <button key={exercise.planned_id} class="grid w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border-0 bg-surface-2 p-3 text-left transition active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface" onClick={() => onPick(exercise.planned_id)}>
              <div class="media-thumb size-12 text-lg">
                {src ? <img class="size-full object-contain" src={src} alt="" loading="lazy" /> : '🏋️'}
              </div>
              <div class="min-w-0">
                <h3 class="truncate text-[.88rem]">{exercise.name}</h3>
                <p class="text-[.72rem] text-hint">{formatMuscle(exercise.target || '')} · {exercise.activity_type === 'cardio' ? `${exercise.sets}×${exercise.duration_minutes} min` : isTimed ? `${exercise.sets}×${exercise.reps || exercise.duration_seconds || (exercise.duration_minutes ? exercise.duration_minutes * 60 : 30)}s` : `${exercise.sets}×${exercise.reps}`}</p>
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
