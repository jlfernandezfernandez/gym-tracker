/** Plan: session overview, exercise list, share and finish. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import {
  STATUS_ES,
  cleanTitle,
  completedSetCount,
  currentExercise,
  mediaUrl,
  sessionMuscles,
  showToast,
} from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useCurrent, useSession } from '../App';
import { BodyMap, BusyButton, Empty, Loading, TopBar } from '../ui';

export function Plan() {
  const app = useApp();
  const sessionQuery = useSession();
  const plan = sessionQuery.data;
  const currentQuery = useCurrent(plan?.id);

  if (sessionQuery.isLoading) return <Loading message="Cargando plan..." />;
  if (sessionQuery.isError || !plan)
    return (
      <>
        {!app.readOnly && <TopBar title="Plan" onBack={app.pop} />}
        <Empty icon="🔗">No pude cargar este plan.</Empty>
      </>
    );

  const exercises = plan.exercises || [];
  const completedSetsTotal = exercises.reduce((total: number, exercise: any) => total + completedSetCount(exercise), 0);
  const targetSetsTotal = exercises.reduce((total: number, exercise: any) => total + (exercise.sets || 0), 0);
  const progressPct = targetSetsTotal ? Math.round((completedSetsTotal / targetSetsTotal) * 100) : 0;
  const muscles = sessionMuscles(exercises);
  const heroMedia = mediaUrl(
    exercises.find((exercise: any) => exercise.gif_url || exercise.image_url)?.gif_url ||
      exercises.find((exercise: any) => exercise.image_url)?.image_url,
  );
  const currentPlannedId = currentQuery.data?.current_planned_exercise_id;
  const openExercise = (plannedId: number) => app.push({ name: 'exercise', plannedId });

  return (
    <>
      <TopBar
        title={cleanTitle(plan.title) || 'Plan del coach'}
        subtitle={app.readOnly ? 'Plan compartido contigo' : 'Creado por el coach. Aquí se ejecuta y registra.'}
        onBack={app.readOnly ? undefined : app.pop}
      />
      <div class="session-hero card">
        {heroMedia && (
          <div class="session-hero-media">
            <img src={heroMedia} loading="eager" />
          </div>
        )}
        <div class="session-hero-content">
          <div class="meta">
            <span class="pill active">{STATUS_ES[plan.status] || plan.status}</span>
            <span class="pill">{plan.duration_estimated || 0} min</span>
          </div>
          <h1>{cleanTitle(plan.title)}</h1>
          <p>{plan.goal || plan.coach_summary || 'Plan generado por el coach'}</p>
          <div class="progress">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <div class="grid stats mt-2.5">
            <div class="stat">
              <b>{exercises.length}</b>
              <span>ejercicios</span>
            </div>
            <div class="stat">
              <b>
                {completedSetsTotal}/{targetSetsTotal}
              </b>
              <span>series</span>
            </div>
            <div class="stat">
              <b>{progressPct}%</b>
              <span>progreso</span>
            </div>
          </div>
        </div>
      </div>

      {muscles.length > 0 && (
        <div class="card">
          <h2>Mapa muscular de hoy</h2>
          <BodyMap muscles={muscles} />
          <div class="meta muscle-cloud">
            {muscles.slice(0, 10).map((muscle) => (
              <span class="pill" key={muscle}>
                {muscle}
              </span>
            ))}
          </div>
        </div>
      )}

      {exercises.map((exercise: any) => (
        <ExerciseCard
          key={exercise.planned_id}
          exercise={exercise}
          isCurrent={String(exercise.planned_id) === String(currentPlannedId)}
          onOpen={() => openExercise(exercise.planned_id)}
        />
      ))}

      {plan.status === 'completed' && <CompletedSummary plan={plan} exercises={exercises} />}

      {!app.readOnly && plan.status !== 'completed' && (
        <div class="row mt-3">
          <button class="btn" onClick={() => openExercise(currentExercise(plan, currentQuery.data)?.planned_id)}>
            ▶ Ejercicio actual
          </button>
          <FinishButton sessionId={plan.id} energy={plan.energy} discomfort={plan.discomfort} />
        </div>
      )}
      {!app.readOnly && plan.share_token && <ShareButton title={cleanTitle(plan.title)} token={plan.share_token} />}
    </>
  );
}

function ExerciseCard({ exercise, isCurrent, onOpen }: { exercise: any; isCurrent: boolean; onOpen: () => void }) {
  const mediaSrc = mediaUrl(exercise.gif_url || exercise.image_url);
  const progressPct = exercise.sets ? Math.min(100, Math.round((completedSetCount(exercise) / exercise.sets) * 100)) : 0;
  return (
    <div class={`card tap exercise-card ${isCurrent ? 'current' : ''}`} onClick={onOpen}>
      <div class="exercise-media">{mediaSrc ? <img src={mediaSrc} loading="lazy" /> : '🏋️'}</div>
      <div class="exercise-card-body">
        <div class="exercise-title-row">
          <h3>{exercise.name || 'Ejercicio'}</h3>
          <span class="pill">
            {completedSetCount(exercise)}/{exercise.sets}
          </span>
        </div>
        <p>
          {exercise.target || exercise.muscle_group || ''}
          {exercise.equipment ? ` · ${exercise.equipment}` : ''}
        </p>
        <div class="progress mini">
          <div style={{ width: `${progressPct}%` }} />
        </div>
        <div class="meta">
          <span class="pill active">
            {exercise.sets}×{exercise.reps}
          </span>
          <span class="pill">{exercise.weight ? `${exercise.weight}kg` : 'peso corporal'}</span>
          <span class={`pill st-${exercise.status}`}>{STATUS_ES[exercise.status] || exercise.status}</span>
          {isCurrent && <span class="pill active">actual</span>}
        </div>
      </div>
    </div>
  );
}

function CompletedSummary({ plan, exercises }: { plan: any; exercises: any[] }) {
  const totalVolume = exercises.reduce(
    (total, exercise) =>
      total + (exercise.performed_sets || []).reduce((sum: number, set: any) => sum + set.weight * set.reps, 0),
    0,
  );
  const totalPerformedSets = exercises.reduce((total, exercise) => total + (exercise.performed_sets || []).length, 0);
  return (
    <div class="card">
      <h2>Sesión completada</h2>
      {plan.feedback && <p>{plan.feedback}</p>}
      <div class="grid stats mt-2.5">
        <div class="stat">
          <b>{totalPerformedSets}</b>
          <span>series</span>
        </div>
        <div class="stat">
          <b>{Math.round(totalVolume)}</b>
          <span>kg volumen</span>
        </div>
        <div class="stat">
          <b>{plan.duration_actual || plan.duration_estimated || 0}min</b>
          <span>duración</span>
        </div>
      </div>
    </div>
  );
}

function ShareButton({ title, token }: { title: string; token: string }) {
  const share = async () => {
    const shareUrl = `${location.origin}/session/share/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      haptic('ok');
      showToast('Enlace copiado — pásaselo a tu compañero', 'ok');
    } catch {
      // Clipboard can be blocked (Telegram webview) — fall back to the native share sheet.
      if (navigator.share) navigator.share({ title, url: shareUrl }).catch(() => {});
      else prompt('Copia el enlace:', shareUrl);
    }
  };
  return (
    <button class="btn ghost mt-2.5" onClick={share}>
      🔗 Compartir con un compañero
    </button>
  );
}

function FinishButton({ sessionId, energy, discomfort }: { sessionId: number; energy: number; discomfort: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  // Native <dialog>: prompt() is unreliable inside the Telegram webview.
  useEffect(() => {
    isOpen ? dialogRef.current?.showModal() : dialogRef.current?.close();
  }, [isOpen]);

  const finishSession = useMutation({
    mutationFn: () =>
      apiFetch('POST', `/sessions/${sessionId}/finish`, {
        feedback: feedbackRef.current?.value || '',
        energy: energy || 5,
        discomfort: discomfort || '',
      }),
    onSuccess: (updatedSession) => {
      queryClient.setQueryData(['session', sessionId], updatedSession);
      queryClient.invalidateQueries({ queryKey: ['active'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['records'] });
      setIsOpen(false);
      haptic('ok');
      showToast('Sesión finalizada', 'ok');
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });

  return (
    <>
      <button class="btn secondary" onClick={() => setIsOpen(true)}>
        ✓ Finalizar
      </button>
      <dialog ref={dialogRef} class="sheet" onClose={() => setIsOpen(false)}>
        <h2>Finalizar sesión</h2>
        <p>Cuéntale al coach cómo ha ido (opcional).</p>
        <textarea ref={feedbackRef} placeholder="Fácil, duro, molestias, sensaciones..." />
        <div class="row mt-3">
          <button class="btn ghost" onClick={() => setIsOpen(false)}>
            Cancelar
          </button>
          <BusyButton busy={finishSession.isPending} busyLabel="Finalizando..." onClick={() => finishSession.mutate()}>
            ✓ Finalizar
          </BusyButton>
        </div>
      </dialog>
    </>
  );
}
