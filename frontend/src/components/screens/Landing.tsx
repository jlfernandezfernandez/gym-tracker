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
      <div class="hero landing-hero">
        <p class="eyebrow">Gym Coach</p>
        <h1>
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
        <div class={`card landing-session ${plan ? "has-session" : ""}`}>
          {!plan ? (
            <Empty icon="🏋️">Sin sesión activa.</Empty>
          ) : (
            <>
              <div class="exercise-title-row">
                <h2>{cleanTitle(plan.title)}</h2>
                <span class="pill active">{progressPct}%</span>
              </div>
              {/* During a workout the landing IS the workout: the upcoming set, grouped as one inset card. */}
              <div class="landing-next">
                <div class="landing-current">
                  <div class="exercise-media">
                    {mediaSrc ? <img src={mediaSrc} loading="eager" /> : "🏋️"}
                  </div>
                  <div class="landing-current-info">
                    <p class="eyebrow">Serie actual</p>
                    <h3>
                      {currentState?.current_exercise_name ||
                        activeExercise?.name ||
                        "—"}
                    </h3>
                  </div>
                </div>
                <div
                  class="workout-progress"
                  aria-label={`Serie ${doneSetCount + 1} de ${totalSetCount}`}
                >
                  {Array.from({ length: totalSetCount }, (_, setIndex) => (
                    <span
                      key={setIndex}
                      class={
                        setIndex < doneSetCount
                          ? "done"
                          : setIndex === doneSetCount
                            ? "active"
                            : ""
                      }
                    />
                  ))}
                </div>
                <div class="grid stats kpis">
                  <div class="stat">
                    <b>{formatWeight(nextWeight, activeExercise?.weight_mode)}</b>
                    <span>{activeExercise?.weight_mode === "weighted" ? "carga" : ""}</span>
                  </div>
                  <div class="stat">
                    <b>{activeExercise?.reps || "-"}</b>
                    <span>reps</span>
                  </div>
                </div>
              </div>
              <button class="btn mt-3" onClick={() => openPlan(true)}>
                Continuar entreno
              </button>
              <button class="btn ghost mt-3" onClick={() => openPlan(false)}>
                Ver plan completo
              </button>
            </>
          )}
        </div>
      )}

      <div class="home-nav mt-3.5">
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
