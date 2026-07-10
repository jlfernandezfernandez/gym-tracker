/** Record detail: per-session history and progression chart for one exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { chartUsesWeight } from '../../lib/chart';
import { formatDate } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, ProgressChart, TopBar } from '../ui';

export function RecordDetail({ exerciseId, title }: { exerciseId: number; title: string }) {
  const app = useApp();
  const progressQuery = useQuery({
    queryKey: ['progress', exerciseId, 'full'],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}/progress?limit=50`),
  });
  const points = progressQuery.data || [];
  const maxWeight = points.length ? Math.max(...points.map((point: any) => point.top_weight || 0)) : 0;
  const maxReps = points.length ? Math.max(...points.map((point: any) => point.top_reps || 0)) : 0;
  const usesWeight = chartUsesWeight(points);
  const latestPoint = points[points.length - 1];

  return (
    <>
      <TopBar title={title} subtitle="Progresión por sesión" onBack={app.pop} />
      {progressQuery.isLoading ? (
        <Loading />
      ) : progressQuery.isError ? (
        <Empty icon="⚠️">No pude cargar el detalle.</Empty>
      ) : !points.length ? (
        <Empty icon="📈">Sin datos todavía.</Empty>
      ) : (
        <>
          <div class="card">
            <div class="grid stats">
              <div class="stat">
                <b>{usesWeight ? `${maxWeight} kg` : `${maxReps} reps`}</b>
                <span>máximo</span>
              </div>
              <div class="stat">
                <b>{points.length}</b>
                <span>sesiones</span>
              </div>
              <div class="stat">
                <b>{usesWeight ? `${latestPoint.top_weight} kg` : `${latestPoint.top_reps} reps`}</b>
                <span>última</span>
              </div>
            </div>
          </div>
          {points.length >= 2 && (
            <div class="card">
              <h3>Progresión</h3>
              <p class="text-xs">{usesWeight ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
              <ProgressChart points={points} />
            </div>
          )}
          <div class="section-heading">
            <p class="eyebrow">Historial</p>
            <h2>{points.length} sesiones</h2>
          </div>
          <div class="history-list">
            {[...points].reverse().map((point: any) => (
              <button
                class="history-row"
                key={point.session_id}
                onClick={() => app.openSession(point.session_id)}
              >
                <span class="history-date">{formatDate(point.date)}</span>
                <span class="history-main">
                  <b>
                    {usesWeight ? `${point.top_weight} kg` : `${point.top_reps} reps`}
                    {point.sets > 1 ? ` · ${point.sets} series` : ' · 1 serie'}
                  </b>
                  <small>
                    {usesWeight ? `${Math.round(point.volume)} kg volumen` : `${point.sets} series`}
                  </small>
                </span>
                <span class="history-chevron">›</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
