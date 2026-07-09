/** Personal records: max weight per exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { fmtDate, mediaUrl } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

export function Records() {
  const app = useApp();
  const records = useQuery({ queryKey: ['records'], queryFn: () => apiFetch('GET', '/exercises/records') });

  return (
    <>
      <TopBar title="Mis marcas" subtitle="Peso máximo por ejercicio" onBack={app.pop} />
      {records.isLoading ? (
        <Loading />
      ) : records.isError ? (
        <Empty icon="⚠️">No pude cargar las marcas.</Empty>
      ) : !records.data?.length ? (
        <Empty icon="🏆">
          Sin marcas todavía.
          <br />
          Registra series y aparecerán aquí.
        </Empty>
      ) : (
        records.data.map((r: any) => (
          <div
            class="card tap exercise-card"
            key={r.exercise_id}
            onClick={() => app.push({ name: 'recordDetail', exerciseId: r.exercise_id, title: r.name })}
          >
            <div class="exercise-media">{r.image_url ? <img src={mediaUrl(r.image_url)} loading="lazy" /> : '🏋️'}</div>
            <div class="exercise-card-body">
              <div class="exercise-title-row">
                <h3>{r.name}</h3>
                <span class="pill active">{r.max_weight ? `${r.max_weight}kg` : 'corporal'}</span>
              </div>
              <p>
                {r.muscle_group || ''}
                {r.equipment ? ` · ${r.equipment}` : ''}
              </p>
              <div class="meta">
                <span class="pill">{fmtDate(r.last_date)}</span>
                <span class="pill">
                  {r.sessions} {r.sessions === 1 ? 'sesión' : 'sesiones'}
                </span>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
