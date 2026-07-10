/** Personal records: max weight per exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatDate, formatMuscle, mediaUrl } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

/** Groups records by muscle group, largest group first; exercises alphabetical inside each. */
function groupByMuscle(records: any[]): [string, any[]][] {
  const groups = new Map<string, any[]>();
  for (const record of records) {
    const muscleGroup = record.muscle_group || 'otros';
    if (!groups.has(muscleGroup)) groups.set(muscleGroup, []);
    groups.get(muscleGroup)!.push(record);
  }
  for (const groupRecords of groups.values()) {
    groupRecords.sort((first, second) => String(first.name).localeCompare(String(second.name), 'es'));
  }
  return [...groups.entries()].sort((first, second) => second[1].length - first[1].length);
}

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
        groupByMuscle(recordsQuery.data).map(([muscleGroup, records]) => (
          <section key={muscleGroup}>
            <p class="eyebrow list-group">{formatMuscle(muscleGroup)}</p>
            {records.map((record: any) => (
              <button
                class="card tap exercise-card"
                key={record.exercise_id}
                onClick={() => app.push({ name: 'recordDetail', exerciseId: record.exercise_id, title: record.name })}
              >
                <div class="exercise-media">
                  {record.image_url ? <img src={mediaUrl(record.image_url)} alt={record.name || 'Ejercicio'} loading="lazy" /> : '🏋️'}
                </div>
                <div class="exercise-card-body">
                  <h3>{record.name}</h3>
                  <div class="meta">
                    <span class="pill active">{record.weight_mode === 'weighted' ? `${record.max_weight} kg` : `${record.max_reps} reps`}</span>
                    <span class="pill">{formatDate(record.last_date)}</span>
                    <span class="pill">
                      {record.sessions} {record.sessions === 1 ? 'sesión' : 'sesiones'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </section>
        ))
      )}
    </>
  );
}
