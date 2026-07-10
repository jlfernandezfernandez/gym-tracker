/** Personal records: max weight per exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatDate, formatEquipment, formatMuscle, mediaUrl } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

export function Records() {
  const app = useApp();
  const recordsQuery = useQuery({ queryKey: ['records'], queryFn: () => apiFetch('GET', '/exercises/records') });

  return (
    <>
      <TopBar title="Marcas" subtitle="Tu mejor resultado por ejercicio" onBack={app.pop} />
      {recordsQuery.isLoading ? (
        <Loading />
      ) : recordsQuery.isError ? (
        <Empty icon="⚠️">No pude cargar las marcas.</Empty>
      ) : !recordsQuery.data?.length ? (
        <Empty icon="🏆">
          Sin marcas todavía.
          <br />
          Registra series y aparecerán aquí.
        </Empty>
      ) : (
        <div class="records-grid">
        {recordsQuery.data.map((record: any) => (
          <div
            class="card tap exercise-card"
            key={record.exercise_id}
            onClick={() => app.push({ name: 'recordDetail', exerciseId: record.exercise_id, title: record.name })}
          >
            <div class="exercise-media">
              {record.image_url ? <img src={mediaUrl(record.image_url)} loading="lazy" /> : '🏋️'}
            </div>
            <div class="exercise-card-body">
              <div class="exercise-title-row">
                <h3>{record.name}</h3>
                <span class="pill active">{record.weight_mode === 'weighted' ? `${record.max_weight} kg` : `${record.max_reps} reps`}</span>
              </div>
              <p>
                {formatMuscle(record.muscle_group || '')}
                {record.equipment ? ` · ${formatEquipment(record.equipment)}` : ''}
              </p>
              <div class="meta">
                <span class="pill">{formatDate(record.last_date)}</span>
                <span class="pill">
                  {record.sessions} {record.sessions === 1 ? 'sesión' : 'sesiones'}
                </span>
              </div>
            </div>
          </div>
        ))}
        </div>
      )}
    </>
  );
}
