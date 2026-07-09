/** Home: greeting, active session card and navigation. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { cleanTitle, currentExercise, mediaUrl, normalizeSession } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty } from '../ui';

export function Landing() {
  const app = useApp();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile'), retry: 0 });
  const activeQuery = useQuery({
    queryKey: ['active'],
    queryFn: () => apiFetch('GET', '/sessions/active'),
    retry: 0,
  });

  const activeData = activeQuery.data;
  const plan = activeData ? normalizeSession(activeData.session) : null;
  const currentState = activeData?.current;
  const activeExercise = plan ? currentExercise(plan, currentState) : null;

  const openPlan = (goToExercise: boolean) => {
    // Seed the session cache so the plan screen paints instantly.
    queryClient.setQueryData(['session', activeData.session.id], activeData.session);
    app.openSession(activeData.session.id);
    if (goToExercise && activeExercise) app.push({ name: 'exercise', plannedId: activeExercise.planned_id });
  };

  const progressPct = currentState?.total_sets
    ? Math.round((currentState.completed_sets / currentState.total_sets) * 100)
    : 0;
  const mediaSrc = activeExercise ? mediaUrl(activeExercise.gif_url || activeExercise.image_url) : '';
  const lastSet = activeExercise?.performed_sets?.[activeExercise.performed_sets.length - 1];

  return (
    <>
      <div class="hero">
        <h1>{profileQuery.data?.name ? `Hola, ${profileQuery.data.name}` : 'Hola'}</h1>
        <p>
          {activeQuery.isLoading
            ? 'Cargando sesión...'
            : plan
              ? 'Esta es tu sesión activa de hoy'
              : 'Sin sesión activa. Empieza hablando con el coach.'}
        </p>
      </div>

      {!activeQuery.isLoading && (
        <div class="card">
          {!plan ? (
            <Empty icon="🏋️">
              Sin sesión activa.
              <br />
              Empieza hablando con el coach. Él crea el entrenamiento y te manda el botón.
            </Empty>
          ) : (
            <>
              <div class="exercise-title-row">
                <h2>{cleanTitle(plan.title)}</h2>
                <span class="pill">
                  {currentState?.completed_sets || 0}/{currentState?.total_sets || 0} series
                </span>
              </div>
              <div class="progress">
                <div style={{ width: `${progressPct}%` }} />
              </div>
              {/* During a workout the landing IS the workout: current exercise front and center. */}
              <div class="landing-current">
                <div class="exercise-media">{mediaSrc ? <img src={mediaSrc} loading="eager" /> : '🏋️'}</div>
                <div class="landing-current-info">
                  <h3>{currentState?.current_exercise_name || activeExercise?.name || '—'}</h3>
                  <p>
                    Serie {currentState?.current_set_number || 1} de {currentState?.target_sets || activeExercise?.sets || '-'}
                  </p>
                  <div class="meta">
                    <span class="pill active">
                      {activeExercise?.sets || '-'}×{activeExercise?.reps || '-'}
                    </span>
                    <span class="pill">
                      {lastSet
                        ? `último: ${lastSet.weight}kg`
                        : activeExercise?.weight
                          ? `${activeExercise.weight}kg`
                          : 'peso corporal'}
                    </span>
                  </div>
                </div>
              </div>
              <button class="btn mt-3" onClick={() => openPlan(true)}>
                ▶ Continuar entreno
              </button>
              <button class="btn ghost mt-2" onClick={() => openPlan(false)}>
                Ver plan completo
              </button>
            </>
          )}
        </div>
      )}

      <div class="row mt-3.5">
        <button class="btn ghost" onClick={() => app.push({ name: 'history' })}>
          Historial
        </button>
        <button class="btn ghost" onClick={() => app.push({ name: 'records' })}>
          Marcas
        </button>
        <button class="btn ghost" onClick={() => app.push({ name: 'profile' })}>
          Perfil
        </button>
      </div>
    </>
  );
}
