/** Record detail: per-session history and progression chart for one exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { progressMetric, progressUnit, progressValue } from '../../lib/chart';
import { formatDate } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading, Stat } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { ProgressChart } from '../../components/visualizations';

export function RecordDetail({ exerciseId, title }: { exerciseId: number; title: string }) {
  const app = useApp();
  const progressQuery = useQuery({
    queryKey: ['progress', exerciseId, 'full'],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}/progress?limit=50`),
  });
  const points = progressQuery.data || [];
  const metric = progressMetric(points);
  const unit = progressUnit(metric);
  const maximum = points.length ? Math.max(...points.map((point: any) => progressValue(point, metric))) : 0;
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
              <Stat label="Máximo" value={`${maximum} ${unit}`} />
              <Stat label="Sesiones" value={points.length} />
              <Stat label="Última" value={`${progressValue(latestPoint, metric)} ${unit}`} />
            </div>
          </div>
          {points.length >= 2 && (
            <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
              <h3>Progresión</h3>
              <p class="text-xs">{metric === 'minutes' ? 'Minutos máximos por sesión' : metric === 'weight' ? 'Peso máximo por sesión' : 'Repeticiones máximas por sesión'}</p>
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
                    {progressValue(point, metric)} {unit}
                    {point.sets > 1 ? ` · ${point.sets} ${metric === 'minutes' ? 'bloques' : 'series'}` : metric === 'minutes' ? ' · 1 bloque' : ' · 1 serie'}
                  </b>
                  <small class="mt-[3px] block text-[.72rem] text-hint">
                    {metric === 'weight' ? `${Math.round(point.volume)} kg volumen` : metric === 'minutes' ? `${point.top_duration_minutes} min` : `${point.sets} series`}
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
