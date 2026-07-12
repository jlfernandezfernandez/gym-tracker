/** Personal records: max weight per exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatDate, formatMuscle, mediaUrl } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading, TopBar } from '../../components/ui';

/** Groups records by muscle group, largest group first; exercises alphabetical inside each. */
function groupByMuscle(records: any[]): [string, any[]][] {
  const groups = Map.groupBy(records, (record: any) => record.muscle_group || 'otros');
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
            <p class="mt-5 mb-0.5 ml-[3px] text-[.68rem] font-bold tracking-[.07em] text-hint uppercase first:mt-2.5">{formatMuscle(muscleGroup)}</p>
            {records.map((record: any) => (
              <button
                class="my-3 grid w-full cursor-pointer grid-cols-[88px_1fr] items-center gap-[13px] rounded-card border-0 bg-surface p-[11px] text-left text-ink shadow-card transition hover:bg-hover active:scale-[.985] active:bg-hover max-[380px]:grid-cols-[76px_1fr]"
                key={record.exercise_id}
                onClick={() => app.push({ name: 'recordDetail', exerciseId: record.exercise_id, title: record.name })}
              >
                <div class="relative grid h-[88px] place-items-center overflow-hidden rounded-2xl bg-white text-[1.7rem] shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] max-[380px]:h-[76px]">
                  {record.image_url ? <img src={mediaUrl(record.image_url)} alt={record.name || 'Ejercicio'} loading="lazy" /> : '🏋️'}
                </div>
                <div class="min-w-0">
                  <h3>{record.name}</h3>
                  <div class="mt-[9px] flex flex-wrap gap-1.5">
                    <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">{record.weight_mode === 'weighted' ? `${record.max_weight} kg` : `${record.max_reps} reps`}</span>
                    <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">{formatDate(record.last_date)}</span>
                    <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">
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
