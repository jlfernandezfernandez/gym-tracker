/** Profile: athlete data, coach context and measurements. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

const ProfileTile = ({ label, value }: { label: string; value: unknown }) => (
  <div class="profile-tile">
    <b>{String(value || '—')}</b>
    <span>{label}</span>
  </div>
);

function measurementSummary(measurement: any) {
  return [
    measurement.weight_kg && `${measurement.weight_kg}kg`,
    measurement.muscle_kg && `${measurement.muscle_kg}kg músculo`,
    measurement.fat_kg && `${measurement.fat_kg}kg grasa`,
    measurement.score && `score ${measurement.score}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Profile() {
  const app = useApp();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile') });
  const measurementsQuery = useQuery({
    queryKey: ['measurements'],
    queryFn: () => apiFetch('GET', '/profile/measurements?limit=8'),
    retry: 0,
  });

  const profile = profileQuery.data;
  const measurements: any[] = measurementsQuery.data || [];
  const latestMeasurement = measurements[0];

  const fixedFacts: [string, unknown][] = profile
    ? [
        ['Objetivo', profile.goal],
        ['Experiencia', profile.experience_level],
        ['Días/semana', profile.training_days_per_week],
        ['Min/sesión', profile.usual_session_minutes],
        ['Edad', profile.age],
        ['Altura', profile.height_cm && `${profile.height_cm} cm`],
        ['Gym', profile.gym_name],
      ]
    : [];
  const coachContext: [string, unknown][] = profile
    ? [
        ['Patologías', profile.injuries],
        ['Limitaciones', profile.limitations],
        ['Equipamiento', profile.available_equipment],
        ['No disponible', profile.unavailable_equipment],
        ['Le gustan', profile.preferred_exercises],
        ['No le gustan', profile.disliked_exercises],
        ['Notas', profile.notes],
      ]
    : [];

  return (
    <>
      <TopBar title="Tu perfil" subtitle="Lo que el coach sabe de ti" onBack={app.pop} />
      {profileQuery.isLoading ? (
        <Loading />
      ) : profileQuery.isError || !profile ? (
        <Empty icon="⚠️">No pude cargar el perfil.</Empty>
      ) : (
        <>
          <div class="card">
            <h1>{profile.name || 'Atleta'}</h1>
            <p>{profile.onboarding_complete ? 'Perfil deportivo activo' : 'Onboarding pendiente — habla con el coach'}</p>
            {(latestMeasurement || profile.weight_kg) && (
              <div class="profile-grid mt-3">
                <ProfileTile
                  label="Peso actual"
                  value={
                    (latestMeasurement?.weight_kg || profile.weight_kg) &&
                    `${latestMeasurement?.weight_kg || profile.weight_kg} kg`
                  }
                />
                <ProfileTile label="Músculo" value={latestMeasurement?.muscle_kg && `${latestMeasurement.muscle_kg} kg`} />
                <ProfileTile label="Grasa" value={latestMeasurement?.fat_kg && `${latestMeasurement.fat_kg} kg`} />
                <ProfileTile label="Score" value={latestMeasurement?.score} />
              </div>
            )}
          </div>

          <div class="card">
            <h2>Datos fijos</h2>
            <div class="profile-grid mt-2.5">
              {fixedFacts
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <ProfileTile key={label} label={label} value={value} />
                ))}
            </div>
          </div>

          {coachContext.some(([, value]) => value) && (
            <div class="card">
              <h2>Contexto del coach</h2>
              <div class="sets mt-2.5">
                {coachContext
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div class="set-row" key={label}>
                      <span class="n">{label}</span>
                      <span class="v max-w-[62%] text-right">{String(value)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div class="card">
            <h2>Mediciones</h2>
            {measurements.length ? (
              <>
                <p>Peso, composición corporal o cualquier medición futura. Cada dato con fecha y fuente.</p>
                <div class="measure-list mt-2.5">
                  {measurements.map((measurement) => (
                    <div class="measure-row" key={measurement.id}>
                      <div>
                        <b>{measurementSummary(measurement) || 'Medición'}</b>
                        <p>
                          {measurement.source || 'manual'} · {new Date(measurement.measured_at).toLocaleDateString('es-ES')}
                          {measurement.notes ? ` · ${measurement.notes}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
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
