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
                <b>{usesWeight ? `${maxWeight}kg` : `${maxReps} reps`}</b>
                <span>máximo</span>
              </div>
              <div class="stat">
                <b>{points.length}</b>
                <span>sesiones</span>
              </div>
              <div class="stat">
                <b>{usesWeight ? `${latestPoint.top_weight}kg` : `${latestPoint.top_reps} reps`}</b>
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
          <div class="card">
            <h3>Sesiones</h3>
            <div class="sets mt-2">
              {[...points].reverse().map((point: any) => (
                <div class="set-row" key={point.date}>
                  <span class="n">{formatDate(point.date)}</span>
                  <span class="v">
                    {usesWeight ? `${point.top_weight}kg máx · ${point.sets} series · ${Math.round(point.volume)}kg vol` : `${point.top_reps} reps máx · ${point.sets} series`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
