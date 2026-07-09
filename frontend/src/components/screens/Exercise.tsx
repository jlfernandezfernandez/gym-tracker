/** Exercise: detail, set logging and completion. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { completedSetCount, mediaUrl, sessionMuscles, showToast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useSession } from '../App';
import { BodyMap, BusyButton, Empty, Loading, ProgressChart, TopBar } from '../ui';

function SetRow({ set, sessionId, plannedId }: { set: any; sessionId: number; plannedId: number }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch('DELETE', `/sessions/${sessionId}/exercises/${plannedId}/sets/${set.id}`),
    onSuccess: (updated: any) => {
      queryClient.setQueryData(['session', sessionId], updated);
      queryClient.invalidateQueries({ queryKey: ['current', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['progress', set.exercise_id] });
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
        {set.reps} reps · {set.weight}kg
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
      <TopBar
        title={exercise.name || 'Ejercicio'}
        subtitle={`${exercise.target || exercise.muscle_group || ''}${exercise.equipment ? ' · ' + exercise.equipment : ''}`}
        onBack={app.pop}
      />
      <div class="exercise-hero">
        <div class="big-media">{mediaSrc ? <img src={mediaSrc} loading="eager" /> : '🏋️'}</div>
        <div class="card">
          <div class="exercise-title-row">
            <h2>{exercise.name || 'Ejercicio'}</h2>
            <span class="pill active">
              {loggedSetCount}/{exercise.sets}
            </span>
          </div>
          <div class="set-dots">
            {Array.from({ length: exercise.sets || 0 }, (_, setIndex) => (
              <span key={setIndex} class={setIndex < loggedSetCount ? 'done' : setIndex === loggedSetCount ? 'next' : ''}>
                {setIndex + 1}
              </span>
            ))}
          </div>
          <div class="meta">
            <span class="pill active">
              {exercise.sets}×{exercise.reps}
            </span>
            <span class="pill">{exercise.weight ? `${exercise.weight}kg sugerido` : 'peso corporal'}</span>
            {exercise.equipment && <span class="pill">{exercise.equipment}</span>}
          </div>
        </div>
      </div>

      <Progression exerciseId={exercise.exercise_id} />

      {muscles.length > 0 && (
        <div class="card compact-map">
          <h2>Músculos</h2>
          <BodyMap muscles={muscles} />
        </div>
      )}

      <details class="card details-card">
        <summary>Técnica y notas</summary>
        <p class="instr open">{instructions}</p>
        {exercise.notes && <p class="mt-2">{exercise.notes}</p>}
      </details>

      {loggedSetCount > 0 && (
        <div class="card">
          <h3>Series registradas</h3>
          <div class="sets mt-2">
            {(exercise.performed_sets || []).map((performedSet: any) => (
              <SetRow key={performedSet.id} set={performedSet} sessionId={plan.id} plannedId={exercise.planned_id} />
            ))}
          </div>
        </div>
      )}

      {/* key={loggedSetCount}: remount per set so inputs re-prefill from the last logged set. */}
      {!app.readOnly && exercise.status !== 'completed' && (
        <LogSetForm key={loggedSetCount} sessionId={plan.id} exercise={exercise} loggedSetCount={loggedSetCount} />
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
    </>
  );
}

function Progression({ exerciseId }: { exerciseId: number }) {
  const progressQuery = useQuery({
    queryKey: ['progress', exerciseId],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}/progress?limit=12`),
  });
  if (!progressQuery.data || progressQuery.data.length < 2) return null;
  return (
    <div class="card">
      <h3>Progresión</h3>
      <p class="text-xs">Peso máximo por sesión</p>
      <ProgressChart points={progressQuery.data} />
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
  // Prefill with the athlete's last logged set (they usually repeat or nudge it), else the coach suggestion.
  const lastSet = exercise.performed_sets?.[loggedSetCount - 1];
  const [weight, setWeight] = useState(String(lastSet?.weight ?? exercise.weight ?? 0));
  const [reps, setReps] = useState(String(lastSet?.reps ?? exercise.reps ?? 10));
  const [note, setNote] = useState('');

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
        sensation: note.toLowerCase().includes('molest') ? 'molestia' : 'ok',
        notes: note,
      }),
    onSuccess: (updatedSession) => {
      refreshAfterMutation(updatedSession);
      haptic('ok');
      showToast('Serie guardada', 'ok');
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

  return (
    <>
      <div class="card">
        <h2>Registrar serie {loggedSetCount + 1}</h2>
        <div class="row mt-2.5">
          <label>
            <p>Peso (kg)</p>
            <input
              type="number"
              inputmode="decimal"
              step="0.5"
              value={weight}
              onInput={(event: any) => setWeight(event.target.value)}
            />
          </label>
          <label>
            <p>Reps</p>
            <input type="number" inputmode="numeric" value={reps} onInput={(event: any) => setReps(event.target.value)} />
          </label>
        </div>
        <textarea
          class="mt-2.5"
          placeholder="Nota: fácil, duro, molestia..."
          value={note}
          onInput={(event: any) => setNote(event.target.value)}
        />
        <BusyButton busy={logSet.isPending} busyLabel="Guardando..." class="btn mt-2.5" onClick={saveSet}>
          ✓ Guardar serie
        </BusyButton>
      </div>
      <BusyButton
        busy={completeExercise.isPending}
        busyLabel="Completando..."
        class="btn secondary mt-2.5"
        onClick={() => completeExercise.mutate()}
      >
        ✓ Completar
      </BusyButton>
    </>
  );
}
