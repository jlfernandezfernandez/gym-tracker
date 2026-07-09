/** Profile: athlete data, coach context and measurements. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

const Tile = ({ k, v }: { k: string; v: unknown }) => (
  <div class="profile-tile">
    <b>{String(v || '—')}</b>
    <span>{k}</span>
  </div>
);

export function Profile() {
  const app = useApp();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile') });
  const measurements = useQuery({
    queryKey: ['measurements'],
    queryFn: () => apiFetch('GET', '/profile/measurements?limit=8'),
    retry: 0,
  });

  const p = profile.data;
  const ms: any[] = measurements.data || [];
  const latest = ms[0];

  const fixed: [string, unknown][] = p
    ? [
        ['Objetivo', p.goal],
        ['Experiencia', p.experience_level],
        ['Días/semana', p.training_days_per_week],
        ['Min/sesión', p.usual_session_minutes],
        ['Edad', p.age],
        ['Altura', p.height_cm && `${p.height_cm} cm`],
        ['Gym', p.gym_name],
      ]
    : [];
  const context: [string, unknown][] = p
    ? [
        ['Patologías', p.injuries],
        ['Limitaciones', p.limitations],
        ['Equipamiento', p.available_equipment],
        ['No disponible', p.unavailable_equipment],
        ['Le gustan', p.preferred_exercises],
        ['No le gustan', p.disliked_exercises],
        ['Notas', p.notes],
      ]
    : [];

  return (
    <>
      <TopBar title="Tu perfil" subtitle="Lo que el coach sabe de ti" onBack={app.pop} />
      {profile.isLoading ? (
        <Loading />
      ) : profile.isError || !p ? (
        <Empty icon="⚠️">No pude cargar el perfil.</Empty>
      ) : (
        <>
          <div class="card">
            <h1>{p.name || 'Atleta'}</h1>
            <p>{p.onboarding_complete ? 'Perfil deportivo activo' : 'Onboarding pendiente — habla con el coach'}</p>
            {(latest || p.weight_kg) && (
              <div class="profile-grid mt-3">
                <Tile k="Peso actual" v={(latest?.weight_kg || p.weight_kg) && `${latest?.weight_kg || p.weight_kg} kg`} />
                <Tile k="Músculo" v={latest?.muscle_kg && `${latest.muscle_kg} kg`} />
                <Tile k="Grasa" v={latest?.fat_kg && `${latest.fat_kg} kg`} />
                <Tile k="Score" v={latest?.score} />
              </div>
            )}
          </div>

          <div class="card">
            <h2>Datos fijos</h2>
            <div class="profile-grid mt-2.5">
              {fixed.filter(([, v]) => v).map(([k, v]) => (
                <Tile key={k} k={k} v={v} />
              ))}
            </div>
          </div>

          {context.some(([, v]) => v) && (
            <div class="card">
              <h2>Contexto del coach</h2>
              <div class="sets mt-2.5">
                {context
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div class="set-row" key={k}>
                      <span class="n">{k}</span>
                      <span class="v max-w-[62%] text-right">{String(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div class="card">
            <h2>Mediciones</h2>
            {ms.length ? (
              <>
                <p>Peso, composición corporal o cualquier medición futura. Cada dato con fecha y fuente.</p>
                <div class="measure-list mt-2.5">
                  {ms.map((m) => {
                    const d = new Date(m.measured_at).toLocaleDateString('es-ES');
                    const bits = [
                      m.weight_kg && `${m.weight_kg}kg`,
                      m.muscle_kg && `${m.muscle_kg}kg músculo`,
                      m.fat_kg && `${m.fat_kg}kg grasa`,
                      m.score && `score ${m.score}`,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <div class="measure-row" key={m.id}>
                        <div>
                          <b>{bits || 'Medición'}</b>
                          <p>
                            {m.source || 'manual'} · {d}
                            {m.notes ? ` · ${m.notes}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p>Aquí irán peso, grasa, músculo, perímetros, check-ins o cualquier medición por fecha cuando el coach las añada.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
