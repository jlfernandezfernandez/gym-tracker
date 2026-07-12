/** History: recent sessions list. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { cleanTitle, formatDate } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

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
      <TopBar title="Historial" subtitle="Tu entrenamiento, en orden" onBack={app.pop} />
      {sessionsQuery.isLoading ? (
        <Loading />
      ) : sessionsQuery.isError ? (
        <Empty icon="⚠️">No pude cargar el historial.</Empty>
      ) : !sessionsQuery.data?.length ? (
        <Empty icon="📊">
          Sin historial todavía.
          <br />
          Empieza a entrenar con el coach.
        </Empty>
      ) : (
        groupByWeek(sessionsQuery.data).map(([label, sessions]) => (
          <section key={label}>
            <p class="mt-5 mb-0.5 ml-[3px] text-[.68rem] font-bold tracking-[.07em] text-hint uppercase first:mt-2.5">{label}</p>
            <div class="mt-2 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_500px]">
              {sessions.map((session: any) => (
                <button class="grid min-h-[76px] w-full cursor-pointer grid-cols-[82px_1fr_auto] items-center gap-2.5 border-0 border-b border-edge bg-transparent px-[15px] py-3 text-left text-ink last:border-b-0 hover:bg-surface-2 active:bg-surface-2" key={session.id} onClick={() => app.openSession(session.id)}>
                  <span class="text-[.74rem] text-hint">{formatDate(session.session_date)}</span>
                  <span class="min-w-0"><b class="block overflow-hidden text-[.9rem] text-ellipsis whitespace-nowrap">{cleanTitle(session.title)}</b><small class="mt-[3px] block text-[.72rem] text-hint">{session.exercise_count || 0} ejercicios · {session.total_sets || 0} series{session.duration_actual ? ` · ${session.duration_actual} min` : ''}</small></span>
                  <span class="text-[1.4rem] text-divider">›</span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
