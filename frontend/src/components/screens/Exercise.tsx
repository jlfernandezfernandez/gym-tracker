/** Exercise: detail, set logging and completion. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { completedSets, mediaUrl, sessionMuscles, toast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useSession } from '../App';
import { BodyMap, BusyButton, Empty, Loading, ProgressChart, TopBar } from '../ui';

export function Exercise({ plannedId }: { plannedId: number }) {
  const app = useApp();
  const session = useSession();
  const p = session.data;
  const ex = p?.exercises?.find((e: any) => String(e.planned_id) === String(plannedId));

  if (session.isLoading) return <Loading />;
  if (!ex)
    return (
      <>
        <TopBar title="Ejercicio" onBack={app.pop} />
        <Empty icon="⚠️">Ejercicio no encontrado.</Empty>
      </>
    );

  const done = completedSets(ex);
  const media = mediaUrl(ex.gif_url || ex.image_url);
  const muscles = sessionMuscles([ex]);
  const instructions = ex.instructions_es || ex.instructions || ex.notes || 'Sigue las indicaciones del coach en Telegram.';

  return (
    <>
      <TopBar
        title={ex.name || 'Ejercicio'}
        subtitle={`${ex.target || ex.muscle_group || ''}${ex.equipment ? ' · ' + ex.equipment : ''}`}
        onBack={app.pop}
      />
      <div class="exercise-hero">
        <div class="big-media">{media ? <img src={media} loading="eager" /> : '🏋️'}</div>
        <div class="card">
          <div class="exercise-title-row">
            <h2>{ex.name || 'Ejercicio'}</h2>
            <span class="pill active">
              {done}/{ex.sets}
            </span>
          </div>
          <div class="set-dots">
            {Array.from({ length: ex.sets || 0 }, (_, i) => (
              <span key={i} class={i < done ? 'done' : i === done ? 'next' : ''}>
                {i + 1}
              </span>
            ))}
          </div>
          <div class="meta">
            <span class="pill active">
              {ex.sets}×{ex.reps}
            </span>
            <span class="pill">{ex.weight ? `${ex.weight}kg sugerido` : 'peso corporal'}</span>
            {ex.equipment && <span class="pill">{ex.equipment}</span>}
          </div>
        </div>
      </div>

      <Progression exerciseId={ex.exercise_id} />

      {muscles.length > 0 && (
        <div class="card compact-map">
          <h2>Músculos</h2>
          <BodyMap muscles={muscles} />
        </div>
      )}

      <details class="card details-card">
        <summary>Técnica y notas</summary>
        <p class="instr open">{instructions}</p>
        {ex.notes && <p class="mt-2">{ex.notes}</p>}
      </details>

      {done > 0 && (
        <div class="card">
          <h3>Series registradas</h3>
          <div class="sets mt-2">
            {(ex.performed_sets || []).map((s: any) => (
              <div class="set-row" key={s.id}>
                <span class="n">Serie {s.set_number}</span>
                <span class="v">
                  {s.reps} reps · {s.weight}kg
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* key={done}: remount per set so inputs re-prefill from the last logged set. */}
      {!app.readOnly && <LogSetForm key={done} sessionId={p.id} ex={ex} done={done} />}
    </>
  );
}

function Progression({ exerciseId }: { exerciseId: number }) {
  const progress = useQuery({
    queryKey: ['progress', exerciseId],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}/progress?limit=12`),
  });
  if (!progress.data || progress.data.length < 2) return null;
  return (
    <div class="card">
      <h3>Progresión</h3>
      <p class="text-xs">Peso máximo por sesión</p>
      <ProgressChart points={progress.data} />
    </div>
  );
}

function LogSetForm({ sessionId, ex, done }: { sessionId: number; ex: any; done: number }) {
  const app = useApp();
  const qc = useQueryClient();
  // Prefill with the athlete's last logged set (they usually repeat or nudge it), else the coach suggestion.
  const last = ex.performed_sets?.[done - 1];
  const [kg, setKg] = useState(String(last?.weight ?? ex.weight ?? 0));
  const [reps, setReps] = useState(String(last?.reps ?? ex.reps ?? 10));
  const [note, setNote] = useState('');

  const invalidate = (updated: any) => {
    qc.setQueryData(['session', sessionId], updated);
    qc.invalidateQueries({ queryKey: ['current', sessionId] });
    qc.invalidateQueries({ queryKey: ['progress', ex.exercise_id] });
    qc.invalidateQueries({ queryKey: ['active'] });
    qc.invalidateQueries({ queryKey: ['records'] });
  };

  const logSet = useMutation({
    mutationFn: () =>
      apiFetch('POST', `/sessions/${sessionId}/exercises/${ex.planned_id}/sets`, {
        set_number: done + 1,
        weight: parseFloat(kg || '0'),
        reps: parseInt(reps || '0'),
        sensation: note.toLowerCase().includes('molest') ? 'molestia' : 'ok',
        notes: note,
      }),
    onSuccess: (updated) => {
      invalidate(updated);
      haptic('ok');
      toast('Serie guardada', 'ok');
    },
    onError: (e: any) => {
      haptic('bad');
      toast(e.message, 'err');
    },
  });

  const complete = useMutation({
    mutationFn: () => apiFetch('POST', `/sessions/${sessionId}/exercises/${ex.planned_id}/complete`),
    onSuccess: (updated) => {
      invalidate(updated);
      haptic('ok');
      toast('Ejercicio completado', 'ok');
      app.pop();
    },
    onError: (e: any) => {
      haptic('bad');
      toast(e.message, 'err');
    },
  });

  return (
    <>
      <div class="card">
        <h2>Registrar serie {done + 1}</h2>
        <div class="row mt-2.5">
          <label>
            <p>Peso (kg)</p>
            <input type="number" inputmode="decimal" step="0.5" value={kg} onInput={(e: any) => setKg(e.target.value)} />
          </label>
          <label>
            <p>Reps</p>
            <input type="number" inputmode="numeric" value={reps} onInput={(e: any) => setReps(e.target.value)} />
          </label>
        </div>
        <textarea class="mt-2.5" placeholder="Nota: fácil, duro, molestia..." value={note} onInput={(e: any) => setNote(e.target.value)} />
        <BusyButton
          busy={logSet.isPending}
          busyLabel="Guardando..."
          class="btn mt-2.5"
          onClick={() => (parseInt(reps || '0') > 0 ? logSet.mutate() : toast('Pon las reps', 'err'))}
        >
          ✓ Guardar serie
        </BusyButton>
      </div>
      <BusyButton busy={complete.isPending} busyLabel="Completando..." class="btn secondary mt-2.5" onClick={() => complete.mutate()}>
        ✓ Completar
      </BusyButton>
    </>
  );
}
