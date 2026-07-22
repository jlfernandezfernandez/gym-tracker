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
  });

  const activeData = activeQuery.data;
  const plan = activeData ? normalizeSession(activeData.session) : null;
  const currentState = activeData?.current;
  const activeExercise = plan ? currentExercise(plan, currentState) : null;

  const openPlan = (goToExercise: boolean) => {
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
        <div class="my-3 rounded-card bg-surface p-5 shadow-card">
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
                  <div class="relative grid h-[88px] place-items-center overflow-hidden rounded-2xl bg-white text-[1.7rem] shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                    {mediaSrc ? <img src={mediaSrc} alt={activeExercise?.name || 'Ejercicio actual'} loading="eager" /> : "🏋️"}
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
                <div
                  class="my-[13px] flex gap-[5px] [&>span]:h-[5px] [&>span]:flex-1 [&>span]:rounded-[9px] [&>span]:bg-track-dim"
                  aria-label={`Serie ${doneSetCount + 1} de ${totalSetCount}`}
                >
                  {Array.from({ length: totalSetCount }, (_, setIndex) => (
                    <span
                      key={setIndex}
                      class={
                        setIndex < doneSetCount
                          ? "!bg-ok-bright"
                          : setIndex === doneSetCount
                            ? "!bg-accent"
                            : ""
                      }
                    />
                  ))}
                </div>
                <div class="grid grid-cols-2 gap-[9px]">
                  <Stat surface label="Carga" value={formatWeight(nextWeight, activeExercise?.weight_mode) || '—'} />
                  <Stat surface label="Reps" value={activeExercise?.reps || "-"} />
                </div>
              </div>
              <button class="mt-3 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-canvas transition active:scale-[.975] active:opacity-[.82]" onClick={() => openPlan(true)}>
                Continuar entreno
              </button>
              <button class="mt-3 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] active:opacity-[.82]" onClick={() => openPlan(false)}>
                Ver plan completo
              </button>
            </>
          )}
        </div>
      )}

    </>
  );
}
