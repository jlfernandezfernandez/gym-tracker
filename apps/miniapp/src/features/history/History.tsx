/** History: recent sessions list. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { Heatmap } from '../../components/visualizations';

/** Monday 00:00 (local) of the week containing the given date. */
function weekStart(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function weekLabel(start: Date, currentWeekStart: Date): string {
  const daysApart = Math.round((currentWeekStart.getTime() - start.getTime()) / 86400000);
  if (daysApart === 0) return 'Esta semana';
  if (daysApart === 7) return 'Semana pasada';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const shortDay = (day: Date) => day.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${shortDay(start)} – ${shortDay(end)}`;
}

/** Groups sessions (already newest-first) into weeks, preserving order. */
function groupByWeek(sessions: any[]): [string, any[]][] {
  const currentWeekStart = weekStart(new Date());
  return [
    ...Map.groupBy(sessions, (session: any) =>
      weekLabel(weekStart(new Date(session.session_date + 'T00:00:00')), currentWeekStart),
    ),
  ];
}

export function History() {
  const app = useApp();
  const sessionsQuery = useQuery({ queryKey: ['sessions'], queryFn: () => apiFetch('GET', '/sessions') });

  return (
    <>
      <TopBar title="Historial" subtitle="Tu entrenamiento, en orden" />
      {sessionsQuery.isLoading ? (
        <Loading />
      ) : sessionsQuery.isError ? (
        <Empty icon="⚠️">No pude cargar el historial.</Empty>
      ) : !sessionsQuery.data?.length ? (
        <>
          <Heatmap sessions={[]} className="mt-3" />
          <Empty icon="📊">
            Sin historial todavía.
            <br />
            Empieza a entrenar con el coach.
          </Empty>
        </>
      ) : (
        <>
          {/* Training Activity Heatmap (Requirement R4) */}
          <Heatmap
            sessions={sessionsQuery.data}
            onSelectDate={(_date, daySessions) => {
              if (daySessions?.[0]?.id) {
                app.openSession(daySessions[0].id);
              }
            }}
            className="mt-3 mb-1"
          />

          {groupByWeek(sessionsQuery.data).map(([label, sessions]) => (
            <section key={label}>
              <p class="mt-5 mb-0.5 ml-[3px] text-[.68rem] font-bold tracking-[.07em] text-hint uppercase first:mt-2.5">{label}</p>
              <div class="mt-2 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_500px]">
                {sessions.map((session: any) => (
                  <button
                    class="group grid min-h-[76px] w-full cursor-pointer grid-cols-[82px_1fr_auto] items-center gap-2.5 border-0 border-b border-edge bg-transparent px-[15px] py-3 text-left text-ink transition-colors last:border-b-0 hover:bg-hover active:bg-hover"
                    key={session.id}
                    onClick={() => app.openSession(session.id)}
                  >
                    <span class="text-[.74rem] font-medium text-hint">{formatDate(session.session_date)}</span>
                    <span class="min-w-0">
                      <b class="block overflow-hidden text-[.9rem] text-ellipsis whitespace-nowrap">{session.title || 'Entrenamiento'}</b>
                      <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[.72rem] text-hint">
                        <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
                          {session.exercise_count || 0} ejerc.
                        </span>
                        <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
                          {session.total_sets || 0} series
                        </span>
                        {session.duration_actual ? (
                          <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
                            ⏱️ {session.duration_actual} min
                          </span>
                        ) : null}
                      </div>
                    </span>
                    <span class="text-[1.3rem] text-divider transition-transform group-active:translate-x-0.5">›</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
