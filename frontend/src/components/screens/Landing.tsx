/** Home: greeting, active session card and navigation. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import {
  cleanTitle,
  currentExercise,
  formatWeight,
  mediaUrl,
  normalizeSession,
} from "../../lib/helpers";
import { useApp } from "../App";
import { Empty } from "../ui";

export function Landing() {
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
  const nextWeight = lastSet?.weight ?? activeExercise?.weight ?? 0;
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
                <h2>{cleanTitle(plan.title)}</h2>
                <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">{progressPct}%</span>
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
                  <div class="rounded-control bg-surface px-2 py-[14px] text-center">
                    <b>{formatWeight(nextWeight, activeExercise?.weight_mode)}</b>
                    <span>{activeExercise?.weight_mode === "weighted" ? "carga" : ""}</span>
                  </div>
                  <div class="rounded-control bg-surface px-2 py-[14px] text-center">
                    <b>{activeExercise?.reps || "-"}</b>
                    <span>reps</span>
                  </div>
                </div>
              </div>
              <button class="mt-3 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-white transition active:scale-[.975] active:opacity-[.82]" onClick={() => openPlan(true)}>
                Continuar entreno
              </button>
              <button class="mt-3 min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] active:opacity-[.82]" onClick={() => openPlan(false)}>
                Ver plan completo
              </button>
            </>
          )}
        </div>
      )}

      <div class="mt-3.5 grid grid-cols-3 gap-[9px] [&>button]:grid [&>button]:min-h-[72px] [&>button]:place-content-center [&>button]:gap-[5px] [&>button]:rounded-2xl [&>button]:border-0 [&>button]:bg-surface [&>button]:text-[.75rem] [&>button]:font-[680] [&>button]:text-ink [&>button]:shadow-card [&>button]:active:scale-95 [&>button>svg]:size-5 [&>button>svg]:justify-self-center [&>button>svg]:text-accent">
        <button onClick={() => app.push({ name: "history" })}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 2.6-6.4" />
            <path d="M3 4v5h5" />
          </svg>
          Historial
        </button>
        <button onClick={() => app.push({ name: "records" })}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="15 7 21 7 21 13" />
          </svg>
          Marcas
        </button>
        <button onClick={() => app.push({ name: "profile" })}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
          </svg>
          Perfil
        </button>
      </div>
    </>
  );
}
