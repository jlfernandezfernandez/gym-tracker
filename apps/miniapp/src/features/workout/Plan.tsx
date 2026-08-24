/** Plan: session overview, exercise list, share and finish. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import {
  completedSetCount,
  currentExercise,
  formatEquipment,
  formatMuscle,
  formatStatus,
  mediaUrl,
  sessionMuscles,
  showToast,
} from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useCurrent, useSession } from '../../app/App';
import { BusyButton, Empty, Loading, Stat } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { ConfirmSheet } from '../../components/sheet';
import { BodyMap } from '../../components/visualizations';
import { calculateMuscleLoadSplit, type MuscleLoadItem } from '../../lib/volume';

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
  // A finished session has no "current" exercise — the backend falls back to the last one.
  const currentPlannedId = plan.status === 'completed' ? null : currentQuery.data?.current_planned_exercise_id;
  const openExercise = (plannedId: number) => app.push({ name: 'exercise', plannedId });

  return (
    <>
      <TopBar
        title={plan.title || 'Entrenamiento'}
        subtitle={app.demoMode ? 'Datos ficticios' : app.readOnly ? 'Sesión compartida contigo' : 'Tu ruta para hoy'}
        onBack={app.readOnly && !app.demoMode ? undefined : app.pop}
        action={!app.readOnly && plan.share_token ? <ShareButton title={plan.title || 'Entrenamiento'} token={plan.share_token} /> : undefined}
      />
      <div class="card !p-5">
        <div>
          <div class="mt-[9px] flex flex-wrap gap-1.5">
            <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">{formatStatus(plan.status)}</span>
            <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">{plan.duration_estimated || 0} min</span>
          </div>
          <p class="mt-2">{plan.goal || plan.coach_summary || 'Plan generado por el coach'}</p>
          <div class="mt-2.5 grid grid-cols-3 gap-[9px]">
            <Stat label="Ejercicios" value={exercises.length} />
            <Stat label="Series" value={`${completedSetsTotal}/${targetSetsTotal}`} />
            <Stat label="Progreso" value={`${progressPct}%`} />
          </div>
        </div>
      </div>

      <div class="px-[3px] pt-[22px] pb-[3px]">
        <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Ruta del entreno</p>
        <h2 class="mt-1">{exercises.length} ejercicios</h2>
      </div>

      {exercises.map((exercise: any) => (
        <ExerciseCard
          key={exercise.planned_id}
          exercise={exercise}
          isCurrent={String(exercise.planned_id) === String(currentPlannedId)}
          onOpen={() => openExercise(exercise.planned_id)}
        />
      ))}

      {muscles.length > 0 && (
        <details class="card [&[open]>summary]:mb-2.5">
          <summary>Mapa muscular de la sesión</summary>
          <BodyMap muscles={muscles} />
        </details>
      )}

      {plan.status === 'completed' && <CompletedSummary plan={plan} exercises={exercises} />}

      {!app.readOnly && plan.status !== 'completed' && (
        <div class="mt-3 flex items-center gap-[9px] [&>button]:min-w-0 [&>button]:flex-1">
          <button class="btn-primary bg-ink text-canvas" onClick={() => {
            const nextId = currentExercise(plan, currentQuery.data)?.planned_id;
            if (nextId != null) openExercise(nextId);
          }}>
            Continuar
          </button>
          <FinishButton sessionId={plan.id} energy={plan.energy} discomfort={plan.discomfort} />
        </div>
      )}
    </>
  );
}

function ExerciseCard({ exercise, isCurrent, onOpen }: { exercise: any; isCurrent: boolean; onOpen: () => void }) {
  const mediaSrc = mediaUrl(exercise.image_url || exercise.gif_url);
  return (
    <button class={`my-3 grid w-full cursor-pointer grid-cols-[88px_1fr] items-center gap-[13px] rounded-card border-0 bg-surface p-[11px] text-left text-ink shadow-card transition hover:bg-hover active:scale-[.985] active:bg-hover max-[380px]:grid-cols-[76px_1fr] ${isCurrent ? 'ring-2 ring-accent/30 shadow-[0_6px_24px_rgba(0,0,0,.06)]' : ''}`} onClick={onOpen}>
      <div class="media-thumb size-[88px] max-[380px]:size-[76px] shrink-0 text-[1.7rem]">{mediaSrc ? <img class="size-full object-contain p-1" src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="lazy" /> : '🏋️'}</div>
      <div class="min-w-0">
        <div class="flex items-start justify-between gap-3 [&>div]:min-w-0">
          <h3>{exercise.name || 'Ejercicio'}</h3>
          <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">
            {completedSetCount(exercise)}/{exercise.sets}
          </span>
        </div>
        <p>
          {formatMuscle(exercise.target || exercise.muscle_group || '')}
          {exercise.equipment ? ` · ${formatEquipment(exercise.equipment)}` : ''}
          {exercise.unilateral ? ' · Unilateral' : ''}
        </p>
        <div class="mt-[9px] flex flex-wrap gap-1.5">
          {exercise.superset_group && (
            <span class="rounded-pill bg-accent/15 px-2 py-1 text-[.68rem] font-[650] text-accent">
              ⚡ Superserie {exercise.superset_group}
            </span>
          )}
          <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
            {exercise.activity_type === 'cardio'
              ? exercise.duration_minutes
                ? `${exercise.sets}×${exercise.duration_minutes} min`
                : 'Cardio'
              : `${exercise.sets}×${exercise.reps}`}
          </span>
          <span class={`rounded-pill px-2 py-1 text-[.68rem] font-[650] ${exercise.status === 'completed' ? 'bg-ok-bg text-ok' : exercise.status === 'skipped' ? 'bg-warn-bg text-warn' : exercise.status === 'in_progress' ? 'bg-accent-bg text-accent' : 'bg-surface-2 text-hint'}`}>{formatStatus(exercise.status)}</span>
        </div>
      </div>
    </button>
  );
}

export function CompletedSummary({ plan, exercises }: { plan: any; exercises: any[] }) {
  const totalPerformedSets = exercises.reduce((total, exercise) => total + (exercise.performed_sets || []).length, 0);
  const split = calculateMuscleLoadSplit(exercises);

  return (
    <div class="card !p-5" data-testid="completed-summary">
      <div class="flex items-center justify-between gap-3">
        <h2>Sesión completada</h2>
        <span class="rounded-pill bg-ok-bg px-2.5 py-1 text-[.72rem] font-bold text-ok">✓ Finalizada</span>
      </div>
      {plan.feedback && <p class="mt-2 text-hint italic">«{plan.feedback}»</p>}
      <div class="mt-3.5 grid grid-cols-3 gap-[9px]">
        <Stat label="Series" value={totalPerformedSets} />
        <Stat label="Volumen" value={`${Math.round(plan.total_volume || split.totalLoad || 0)} kg`} />
        <Stat label="Duración" value={plan.duration_actual || plan.duration_estimated ? `${plan.duration_actual || plan.duration_estimated} min` : '—'} />
      </div>

      {/* Post-Workout Muscle Load Split (Requirement R5) */}
      {split.muscles.length > 0 && (
        <div class="mt-5 pt-4 border-t border-edge" data-testid="muscle-load-split">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-[.92rem] font-bold text-ink">Distribución de carga muscular</h3>
            <span class="text-[.7rem] text-hint font-medium">{split.muscles.length} grupos</span>
          </div>
          <p class="mt-0.5 text-[.72rem] text-hint">
            Porcentaje de volumen efectivo absorbido (excluye series de calentamiento).
          </p>

          {/* Multi-segment proportional stacked split bar */}
          <div
            class="mt-3 flex h-[14px] w-full overflow-hidden rounded-pill bg-surface-2 p-[2px] shadow-inner"
            aria-label="Barra proporcional de carga muscular"
            data-testid="split-progress-bar"
          >
            {split.muscles.map((item) => (
              <div
                key={item.muscle}
                class="h-full first:rounded-l-pill last:rounded-r-pill transition-all"
                style={{
                  width: `${Math.max(item.percentage, 3)}%`,
                  backgroundColor: item.color || 'var(--color-accent)',
                }}
                title={`${item.name}: ${item.percentage}% (${item.load} kg)`}
              />
            ))}
          </div>

          {/* Ranked muscle breakdown rows */}
          <div class="mt-3.5 space-y-2.5" data-testid="muscle-split-list">
            {split.muscles.map((item) => (
              <div key={item.muscle} class="rounded-xl bg-surface-2 p-2.5 shadow-xs">
                <div class="flex items-center justify-between text-[.82rem]">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color || 'var(--color-accent)' }}
                      aria-hidden="true"
                    />
                    <span class="font-bold text-ink truncate">{item.name}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-[.8rem]">
                    <span class="font-bold text-accent">{item.percentage}%</span>
                    <span class="text-[.72rem] text-hint">({item.load} kg)</span>
                  </div>
                </div>

                {/* Individual progress track */}
                <div class="mt-1.5 h-[5px] w-full overflow-hidden rounded-pill bg-track-dim">
                  <div
                    class="h-full rounded-pill transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color || 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Session BodyMap visualization */}
          <div class="mt-4 rounded-card bg-surface-2 p-3">
            <p class="text-[.7rem] font-bold uppercase tracking-wider text-hint mb-1">
              Mapa de absorción
            </p>
            <BodyMap mode="balance" volumeData={split.volumeMap} showLegend={false} />
          </div>
        </div>
      )}
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
    <button class="min-h-11 min-w-11 cursor-pointer rounded-pill border-0 bg-surface px-[14px] text-[.82rem] font-[680] text-accent shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_rgba(0,0,0,.04)] active:scale-95" onClick={share}>
      Compartir
    </button>
  );
}

function FinishButton({ sessionId, energy, discomfort }: { sessionId: number; energy: number; discomfort: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

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
      <button class="btn-primary bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]" onClick={() => setIsOpen(true)}>
        ✓ Finalizar
      </button>
      <ConfirmSheet
        open={isOpen}
        title="Finalizar sesión"
        message="Cuéntale al coach cómo ha ido (opcional)."
        confirmLabel="✓ Finalizar"
        busy={finishSession.isPending}
        onConfirm={() => finishSession.mutate()}
        onCancel={() => setIsOpen(false)}
      >
        <textarea ref={feedbackRef} class="mt-3" placeholder="Fácil, duro, molestias, sensaciones..." />
      </ConfirmSheet>
    </>
  );
}
