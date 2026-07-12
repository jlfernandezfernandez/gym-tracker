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
          <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
            <div class="grid grid-cols-3 gap-[9px]">
              <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
                <b>{usesWeight ? `${maxWeight} kg` : `${maxReps} reps`}</b>
                <span>máximo</span>
              </div>
              <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
                <b>{points.length}</b>
                <span>sesiones</span>
              </div>
              <div class="rounded-control bg-surface-2 px-2 py-[14px] text-center">
                <b>{usesWeight ? `${latestPoint.top_weight} kg` : `${latestPoint.top_reps} reps`}</b>
                <span>última</span>
              </div>
            </div>
          </div>
          {points.length >= 2 && (
            <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
              <h3>Progresión</h3>
              <p class="text-xs">{usesWeight ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
              <ProgressChart points={points} />
            </div>
          )}
          <div class="px-[3px] pt-[22px] pb-[3px]">
            <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Historial</p>
            <h2 class="mt-1">{points.length} sesiones</h2>
          </div>
          <div class="mt-[14px] overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_500px]">
            {[...points].reverse().map((point: any) => (
              <button
                class="grid min-h-[76px] w-full cursor-pointer grid-cols-[82px_1fr_auto] items-center gap-2.5 border-0 border-b border-edge bg-transparent px-[15px] py-3 text-left text-ink last:border-b-0 hover:bg-surface-2 active:bg-surface-2"
                key={point.session_id}
                onClick={() => app.openSession(point.session_id)}
              >
                <span class="text-[.74rem] text-hint">{formatDate(point.date)}</span>
                <span class="min-w-0">
                  <b class="block overflow-hidden text-[.9rem] text-ellipsis whitespace-nowrap">
                    {usesWeight ? `${point.top_weight} kg` : `${point.top_reps} reps`}
                    {point.sets > 1 ? ` · ${point.sets} series` : ' · 1 serie'}
                  </b>
                  <small class="mt-[3px] block text-[.72rem] text-hint">
                    {usesWeight ? `${Math.round(point.volume)} kg volumen` : `${point.sets} series`}
                  </small>
                </span>
                <span class="text-[1.4rem] text-divider">›</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
