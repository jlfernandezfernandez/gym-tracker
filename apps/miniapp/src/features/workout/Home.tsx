/** Home: greeting, active session card and navigation. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import {
  currentExercise,
  formatWeight,
  mediaUrl,
  normalizeSession,
} from "../../lib/helpers";
import { useApp } from "../../app/App";
import { Empty, Stat } from "../../components/feedback";
import { Heatmap, SetProgress } from "../../components/visualizations";

export function Home() {
  const app = useApp();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("GET", "/profile"),
    retry: 0,
  });
  const activeQuery = useQuery({
    queryKey: ["active"],
    queryFn: () => apiFetch("GET", "/sessions/active"),
    retry: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch("GET", "/sessions"),
    retry: 0,
  });

  const activeData = activeQuery.data;
  const plan = activeData ? normalizeSession(activeData.session) : null;
  const currentState = activeData?.current;
  const activeExercise = plan ? currentExercise(plan, currentState) : null;

  const openPlan = (goToExercise: boolean) => {
    if (!activeData?.session) return;
    // Seed the session cache so the plan screen paints instantly.
    queryClient.setQueryData(
      ["session", activeData.session.id],
      activeData.session,
    );
    app.openSession(activeData.session.id);
    if (goToExercise && activeExercise)
      app.push({ name: "exercise", plannedId: activeExercise.planned_id });
  };

  // Same workout progress the session screen shows: completed vs target sets.
  const progressPct = currentState?.total_sets
    ? Math.round((currentState.completed_sets / currentState.total_sets) * 100)
    : 0;
  const mediaSrc = activeExercise
    ? mediaUrl(activeExercise.image_url || activeExercise.gif_url)
    : "";
  const lastSet =
    activeExercise?.performed_sets?.[activeExercise.performed_sets.length - 1];
  const nextWeight = lastSet?.weight ?? activeExercise?.weight ?? null;
  const nextDuration = currentState?.next_set_target?.duration_minutes
    ?? lastSet?.duration_minutes
    ?? activeExercise?.duration_minutes
    ?? '—';
  const doneSetCount = activeExercise?.performed_sets?.length || 0;
  const totalSetCount = activeExercise?.sets || currentState?.target_sets || 0;

  return (
    <>
      <div class="px-0.5 pt-[26px] pb-[17px]">
        <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Gym Coach</p>
        <h1 class="mt-[5px]">
          {profileQuery.data?.name ? `Hola, ${profileQuery.data.name}` : "Hola"}
        </h1>
        <p>
          {activeQuery.isLoading
            ? "Cargando sesión..."
            : plan
              ? "Esta es tu sesión activa de hoy"
              : "Sin sesión activa. Empieza hablando con el coach."}
        </p>
      </div>

      {!activeQuery.isLoading && (
        <div class="card !p-5">
          {!plan ? (
            <Empty icon="🏋️">Sin sesión activa.</Empty>
          ) : (
            <>
              <div class="flex items-start justify-between gap-3 [&>div]:min-w-0">
                <h2>{plan.title || 'Entrenamiento'}</h2>
                <span class="shrink-0 rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">Progreso {progressPct}%</span>
              </div>
              {/* During a workout the landing IS the workout: the upcoming set, grouped as one inset card. */}
              <div class="mt-[14px] rounded-[18px] bg-surface-2 p-[14px] shadow-[inset_0_0_0_1px_var(--color-edge)]">
                <div class="grid grid-cols-[88px_1fr] items-center gap-[13px]">
                  <div class="media-thumb size-[88px] shrink-0 text-[1.7rem]">
                    {mediaSrc ? <img class="size-full object-contain p-1" src={mediaSrc} alt={activeExercise?.name || 'Ejercicio actual'} loading="eager" /> : "🏋️"}
                  </div>
                  <div>
                    <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Serie actual</p>
                    <h3>
                      {currentState?.current_exercise_name ||
                        activeExercise?.name ||
                        "—"}
                    </h3>
                  </div>
                </div>
                <SetProgress
                  total={totalSetCount}
                  completedSetNumbers={new Set(Array.from({ length: doneSetCount }, (_, i) => i + 1))}
                  currentSetNumber={doneSetCount + 1}
                  showCurrent={doneSetCount < totalSetCount}
                  class="my-[13px]"
                  ariaLabel={`Serie ${doneSetCount + 1} de ${totalSetCount}`}
                />
                {activeExercise?.activity_type === 'cardio' ? (
                  <Stat surface label="Minutos" value={nextDuration} />
                ) : (
                  <div class="grid grid-cols-2 gap-[9px]">
                    <Stat surface label="Carga" value={formatWeight(nextWeight, activeExercise?.weight_mode) || '—'} />
                    <Stat surface label="Reps" value={activeExercise?.reps || "-"} />
                  </div>
                )}
              </div>
              <button class="btn-primary mt-3 bg-ink text-canvas" onClick={() => openPlan(true)}>
                Continuar entreno
              </button>
              <button class="mt-3 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] active:opacity-[.82]" onClick={() => openPlan(false)}>
                Ver plan completo
              </button>
            </>
          )}
        </div>
      )}

      {/* Training Consistency Heatmap & Streak (Requirement R4) */}
      <Heatmap
        sessions={sessionsQuery.data || []}
        onSelectDate={(_date, daySessions) => {
          if (daySessions?.[0]?.id) {
            app.openSession(daySessions[0].id);
          }
        }}
        className="mt-4"
      />
    </>
  );
}
