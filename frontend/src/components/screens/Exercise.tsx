/** Exercise: detail, set logging and completion. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { apiFetch, type ProgressPoint } from '../../lib/api';
import { chartUsesWeight } from '../../lib/chart';
import { cleanTitle, completedSetCount, formatMuscle, formatWeight, mediaUrl, sessionMuscles, showToast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useSession } from '../App';
import { BodyMap, BusyButton, ConfirmSheet, Empty, Loading, ProgressChart, TopBar } from '../ui';

function SetRow({ set, sessionId, plannedId, exerciseId }: { set: any; sessionId: number; plannedId: number; exerciseId: number }) {
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
    <div class="set-row" key={set.id}>
      <span class="n">Serie {set.set_number}</span>
      <span class="v">
        {set.reps} reps · {formatWeight(set.weight, set.weight_mode)}
        <button class="set-del" disabled={del.isPending} onClick={() => del.mutate()} aria-label="Borrar serie">
          ✕
        </button>
      </span>
    </div>
  );
}

export function Exercise({ plannedId }: { plannedId: number }) {
  const app = useApp();
  const sessionQuery = useSession();
  const plan = sessionQuery.data;
  const exercise = plan?.exercises?.find((candidate: any) => String(candidate.planned_id) === String(plannedId));

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
      <TopBar title={cleanTitle(plan.title)} onBack={app.pop} />
      <div class="workout-progress" aria-label={`Serie ${Math.min(loggedSetCount + 1, exercise.sets)} de ${exercise.sets}`}>
        {Array.from({ length: exercise.sets || 0 }, (_, setIndex) => (
          <span key={setIndex} class={setIndex < loggedSetCount ? 'done' : setIndex === loggedSetCount ? 'active' : ''} />
        ))}
      </div>
      <div class="exercise-focus card">
        <div class="big-media">{mediaSrc ? <img src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="eager" /> : '🏋️'}</div>
        <div class="exercise-focus-content">
          <p class="eyebrow">Serie {Math.min(loggedSetCount + 1, exercise.sets)} de {exercise.sets}</p>
          <h1>{exercise.name || 'Ejercicio'}</h1>
          <p>{formatMuscle(exercise.target || exercise.muscle_group || '')}</p>
        </div>
      </div>
      {!app.readOnly && exercise.status !== 'completed' && (
        <SetCountControl sessionId={plan.id} plannedId={exercise.planned_id} currentSets={exercise.sets || 0} loggedSets={loggedSetCount} />
      )}
      <ExerciseProgress exerciseId={exercise.exercise_id} />
      {/* Primary action first: log the set right under the exercise, history below. */}
      {/* key={loggedSetCount}: remount per set so inputs re-prefill from the last logged set. */}
      {!app.readOnly && exercise.status !== 'completed' && (
        <LogSetForm key={loggedSetCount} sessionId={plan.id} exercise={exercise} loggedSetCount={loggedSetCount} />
      )}
      {loggedSetCount > 0 && (
        <div class="card">
          <h3>Series registradas</h3>
          <div class="sets mt-2">
            {(exercise.performed_sets || []).map((performedSet: any) => (
              <SetRow
                key={performedSet.id}
                set={performedSet}
                sessionId={plan.id}
                plannedId={exercise.planned_id}
                exerciseId={exercise.exercise_id}
              />
            ))}
          </div>
        </div>
      )}
      {!app.readOnly && exercise.status === 'completed' && (
        <div class="card done-card">
          <div class="done-check">✓</div>
          <h3>Ejercicio completado</h3>
          <button class="btn ghost mt-2.5" onClick={app.pop}>
            Volver al plan
          </button>
        </div>
      )}
      <details class="card details-card">
        <summary>Técnica</summary>
        <p class="instr open">{instructions}</p>
        {exercise.notes && <p class="mt-2">{exercise.notes}</p>}
      </details>
      {muscles.length > 0 && (
        <div class="card">
          <h3>Músculos trabajados</h3>
          <BodyMap muscles={muscles} />
        </div>
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
  const lastValue = usesWeight ? last.top_weight : last.top_reps || 0;

  return (
    <>
      <div class="card best-card">
        <div class="best-stat">
          <span class="eyebrow">🏆 Mejor</span>
          <b>{usesWeight ? `${best} kg` : `${best} reps`}</b>
        </div>
        <div class="best-divider" />
        <div class="best-stat">
          <span class="eyebrow">⏱ Última</span>
          <b>{usesWeight ? `${lastValue} kg` : `${lastValue} reps`}</b>
        </div>
      </div>
      {points.length >= 2 && (
        <div class="card">
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
    <div class="card set-count-card">
      <span class="eyebrow">Series</span>
      <div class="set-count-row">
        <button class="set-count-btn" disabled={adjust.isPending || sets <= loggedSets} onClick={() => step(-1)} aria-label="Quitar serie">−</button>
        <span class="set-count-value">{sets}</span>
        <button class="set-count-btn" disabled={adjust.isPending || sets >= 20} onClick={() => step(1)} aria-label="Añadir serie">+</button>
      </div>
    </div>
  );
}

function LogSetForm({
  sessionId,
  exercise,
  loggedSetCount,
}: {
  sessionId: number;
  exercise: any;
  loggedSetCount: number;
}) {
  const app = useApp();
  const queryClient = useQueryClient();
  // Prefill: repeat what the athlete just lifted (ramping sets), else the coach prescription.
  const previousSet = exercise.performed_sets?.at(-1);
  // The backend gives bodyweight exercises their fixed sentinel value.
  const isBodyweight = exercise.weight_mode === 'bodyweight';
  const [weight, setWeight] = useState(String(previousSet?.weight ?? exercise.weight ?? 0));
  const [reps, setReps] = useState(String(previousSet?.reps ?? exercise.reps ?? 10));
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const isLastSet = loggedSetCount + 1 >= (exercise.sets || 1);

  const refreshAfterMutation = (updatedSession: any) => {
    queryClient.setQueryData(['session', sessionId], updatedSession);
    queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['progress', exercise.exercise_id] });
    queryClient.invalidateQueries({ queryKey: ['active'] });
    queryClient.invalidateQueries({ queryKey: ['records'] });
  };

  const logSet = useMutation({
    mutationFn: () =>
      apiFetch('POST', `/sessions/${sessionId}/exercises/${exercise.planned_id}/sets`, {
        set_number: loggedSetCount + 1,
        weight: parseFloat(weight || '0'),
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
    onSuccess: (updatedSession) => {
      refreshAfterMutation(updatedSession);
      haptic('ok');
      showToast('Ejercicio completado', 'ok');
      app.pop();
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
    logSet.mutate();
  };

  const isBusy = logSet.isPending || completeExercise.isPending;
  const setSummary = isBodyweight ? `peso corporal × ${reps || 0}` : `${weight || 0} kg × ${reps || 0}`;

  return (
    <div class="card set-card">
      <div class="row steppers">
        <div class="stepper">
          <label for="set-weight">{isBodyweight ? 'Peso corporal' : 'Peso (kg)'}</label>
          <div>
            {isBodyweight ? (
              <div class="stepper-fixed">Peso corporal</div>
            ) : (
              <input id="set-weight" type="number" inputmode="decimal" step="0.5" value={weight} onInput={(event: any) => setWeight(event.target.value)} />
            )}
          </div>
        </div>
        <div class="stepper">
          <label for="set-reps">Reps</label>
          <div>
            <input id="set-reps" type="number" inputmode="numeric" value={reps} onInput={(event: any) => setReps(event.target.value)} />
          </div>
        </div>
      </div>
      <BusyButton busy={isBusy} busyLabel="Guardando..." class="btn set-save" onClick={saveSet}>
        Registrar {setSummary}
      </BusyButton>
      {!isLastSet && (
        <button class="btn ghost mt-2" disabled={isBusy} onClick={() => setConfirmFinishOpen(true)}>
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
