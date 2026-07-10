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
            <p class="eyebrow list-group">{label}</p>
            <div class="history-list">
              {sessions.map((session: any) => (
                <button class="history-row" key={session.id} onClick={() => app.openSession(session.id)}>
                  <span class="history-date">{formatDate(session.session_date)}</span>
                  <span class="history-main"><b>{cleanTitle(session.title)}</b><small>{session.exercise_count || 0} ejercicios · {session.total_sets || 0} series{session.duration_actual ? ` · ${session.duration_actual} min` : ''}</small></span>
                  <span class="history-chevron">›</span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
