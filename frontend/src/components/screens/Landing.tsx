/** Home: greeting, active session card and navigation. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { currentExercise, mediaUrl, normalize, cleanTitle } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty } from '../ui';

export function Landing() {
  const app = useApp();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile'), retry: 0 });
  const active = useQuery({
    queryKey: ['active'],
    queryFn: () => apiFetch('GET', '/sessions/active'),
    retry: 0,
  });

  const data = active.data;
  const plan = data ? normalize(data.session) : null;
  const cur = data?.current;
  const curEx = plan ? currentExercise(plan, cur) : null;

  const open = (thenExercise: boolean) => {
    // Seed the session cache so the plan screen paints instantly.
    qc.setQueryData(['session', data.session.id], data.session);
    app.openSession(data.session.id);
    if (thenExercise && curEx) app.push({ name: 'exercise', plannedId: curEx.planned_id });
  };

  const pct = cur?.total_sets ? Math.round((cur.completed_sets / cur.total_sets) * 100) : 0;
  const media = curEx ? mediaUrl(curEx.gif_url || curEx.image_url) : '';
  const lastSet = curEx?.performed_sets?.[curEx.performed_sets.length - 1];

  return (
    <>
      <div class="hero">
        <h1>{profile.data?.name ? `Hola, ${profile.data.name}` : 'Hola'}</h1>
        <p>
          {active.isLoading
            ? 'Cargando sesión...'
            : plan
              ? 'Esta es tu sesión activa de hoy'
              : 'Sin sesión activa. Empieza hablando con el coach.'}
        </p>
      </div>

      {!active.isLoading && (
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
                  {cur?.completed_sets || 0}/{cur?.total_sets || 0} series
                </span>
              </div>
              <div class="progress">
                <div style={{ width: `${pct}%` }} />
              </div>
              {/* During a workout the landing IS the workout: current exercise front and center. */}
              <div class="landing-current">
                <div class="exercise-media">{media ? <img src={media} loading="eager" /> : '🏋️'}</div>
                <div class="landing-current-info">
                  <h3>{cur?.current_exercise_name || curEx?.name || '—'}</h3>
                  <p>
                    Serie {cur?.current_set_number || 1} de {cur?.target_sets || curEx?.sets || '-'}
                  </p>
                  <div class="meta">
                    <span class="pill active">
                      {curEx?.sets || '-'}×{curEx?.reps || '-'}
                    </span>
                    <span class="pill">
                      {lastSet ? `último: ${lastSet.weight}kg` : curEx?.weight ? `${curEx.weight}kg` : 'peso corporal'}
                    </span>
                  </div>
                </div>
              </div>
              <button class="btn mt-3" onClick={() => open(true)}>
                ▶ Continuar entreno
              </button>
              <button class="btn ghost mt-2" onClick={() => open(false)}>
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
