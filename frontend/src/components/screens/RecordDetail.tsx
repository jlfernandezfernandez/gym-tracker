/** Record detail: per-session history and progression chart for one exercise. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { fmtDate } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, ProgressChart, TopBar } from '../ui';

export function RecordDetail({ exerciseId, title }: { exerciseId: number; title: string }) {
  const app = useApp();
  const progress = useQuery({
    queryKey: ['progress', exerciseId, 'full'],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}/progress?limit=50`),
  });
  const pts = progress.data || [];
  const max = pts.length ? Math.max(...pts.map((p: any) => p.top_weight || 0)) : 0;

  return (
    <>
      <TopBar title={title} subtitle="Histórico por sesión" onBack={app.pop} />
      {progress.isLoading ? (
        <Loading />
      ) : progress.isError ? (
        <Empty icon="⚠️">No pude cargar el detalle.</Empty>
      ) : !pts.length ? (
        <Empty icon="📈">Sin datos todavía.</Empty>
      ) : (
        <>
          <div class="card">
            <div class="grid stats">
              <div class="stat">
                <b>{max ? `${max}kg` : '—'}</b>
                <span>máximo</span>
              </div>
              <div class="stat">
                <b>{pts.length}</b>
                <span>sesiones</span>
              </div>
              <div class="stat">
                <b>{pts[pts.length - 1].top_weight}kg</b>
                <span>última</span>
              </div>
            </div>
          </div>
          {pts.length >= 2 && (
            <div class="card">
              <h3>Progresión</h3>
              <p class="text-xs">Peso máximo por sesión</p>
              <ProgressChart points={pts} />
            </div>
          )}
          <div class="card">
            <h3>Sesiones</h3>
            <div class="sets mt-2">
              {[...pts].reverse().map((p: any) => (
                <div class="set-row" key={p.date}>
                  <span class="n">{fmtDate(p.date)}</span>
                  <span class="v">
                    {p.top_weight}kg máx · {p.sets} series · {Math.round(p.volume)}kg vol
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
