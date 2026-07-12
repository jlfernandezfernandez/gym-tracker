/** Plan: session overview, exercise list, share and finish. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import {
  cleanTitle,
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
  // A finished session has no "current" exercise — the backend falls back to the last one.
  const currentPlannedId = plan.status === 'completed' ? null : currentQuery.data?.current_planned_exercise_id;
  const openExercise = (plannedId: number) => app.push({ name: 'exercise', plannedId });

  return (
    <>
      <TopBar
        title={cleanTitle(plan.title) || 'Plan del coach'}
        subtitle={app.readOnly ? 'Sesión compartida contigo' : 'Tu ruta para hoy'}
        onBack={app.readOnly ? undefined : app.pop}
        action={!app.readOnly && plan.share_token ? <ShareButton title={cleanTitle(plan.title)} token={plan.share_token} /> : undefined}
      />
      <div class="my-3 rounded-card bg-surface p-5 shadow-card">
        <div>
          <div class="mt-[9px] flex flex-wrap gap-1.5">
            <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">{formatStatus(plan.status)}</span>
            <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">{plan.duration_estimated || 0} min</span>
          </div>
          <h1>{cleanTitle(plan.title)}</h1>
          <p>{plan.goal || plan.coach_summary || 'Plan generado por el coach'}</p>
          <div class="mt-2.5 grid grid-cols-3 gap-[9px]">
            <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
              <b>{exercises.length}</b>
              <span>ejercicios</span>
            </div>
            <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
              <b>
                {completedSetsTotal}/{targetSetsTotal}
              </b>
              <span>series</span>
            </div>
            <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
              <b>{progressPct}%</b>
              <span>progreso</span>
            </div>
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
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h2>Mapa muscular de hoy</h2>
          <BodyMap muscles={muscles} />
        </div>
      )}

      {plan.status === 'completed' && <CompletedSummary plan={plan} exercises={exercises} />}

      {!app.readOnly && plan.status !== 'completed' && (
        <div class="mt-3 flex items-center gap-[9px] [&>button]:min-w-0 [&>button]:flex-1">
          <button class="min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-white transition active:scale-[.975] active:opacity-[.82]" onClick={() => openExercise(currentExercise(plan, currentQuery.data)?.planned_id)}>
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
      <div class="relative grid h-[88px] place-items-center overflow-hidden rounded-2xl bg-white text-[1.7rem] shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] max-[380px]:h-[76px]">{mediaSrc ? <img class="absolute inset-0 size-full object-contain" src={mediaSrc} alt={exercise.name || 'Ejercicio'} loading="lazy" /> : '🏋️'}</div>
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
        </p>
        <div class="mt-[9px] flex flex-wrap gap-1.5">
          <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
            {exercise.sets}×{exercise.reps}
          </span>
          <span class={`rounded-pill px-2 py-1 text-[.68rem] font-[650] ${exercise.status === 'completed' ? 'bg-ok-bg text-ok' : exercise.status === 'skipped' ? 'bg-warn-bg text-warn' : exercise.status === 'in_progress' ? 'bg-accent-bg text-accent' : 'bg-surface-2 text-hint'}`}>{formatStatus(exercise.status)}</span>
        </div>
      </div>
    </button>
  );
}

function CompletedSummary({ plan, exercises }: { plan: any; exercises: any[] }) {
  const totalPerformedSets = exercises.reduce((total, exercise) => total + (exercise.performed_sets || []).length, 0);
  return (
    <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
      <h2>Sesión completada</h2>
      {plan.feedback && <p>{plan.feedback}</p>}
      <div class="mt-2.5 grid grid-cols-3 gap-[9px]">
        <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
          <b>{totalPerformedSets}</b>
          <span>series</span>
        </div>
        <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
          <b>{Math.round(plan.total_volume)}</b>
          <span>kg volumen</span>
        </div>
        <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
          <b>{plan.duration_actual || plan.duration_estimated || '—'}{plan.duration_actual || plan.duration_estimated ? 'min' : ''}</b>
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
    <button class="min-h-11 min-w-11 cursor-pointer rounded-pill border-0 bg-surface px-[14px] text-[.82rem] font-[680] text-accent shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_rgba(0,0,0,.04)] active:scale-95" onClick={share}>
      Compartir
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
      <button class="min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-surface px-[17px] py-[13px] text-[.94rem] font-[720] text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] transition active:scale-[.975] active:opacity-[.82]" onClick={() => setIsOpen(true)}>
        ✓ Finalizar
      </button>
      <dialog ref={dialogRef} class="m-auto mb-2.5 w-[min(100%-20px,430px)] rounded-[24px] border-0 bg-[rgba(250,250,252,.94)] p-5 text-ink shadow-sheet backdrop-blur-3xl backdrop-saturate-150 [&::backdrop]:bg-black/30" onClose={() => setIsOpen(false)}>
        <h2>Finalizar sesión</h2>
        <p>Cuéntale al coach cómo ha ido (opcional).</p>
        <textarea ref={feedbackRef} placeholder="Fácil, duro, molestias, sensaciones..." />
        <div class="mt-3 flex items-center gap-[9px] [&>button]:min-w-0 [&>button]:flex-1">
          <button class="min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] active:opacity-[.82]" onClick={() => setIsOpen(false)}>
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
