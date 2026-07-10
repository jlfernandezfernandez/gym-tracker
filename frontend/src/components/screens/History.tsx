/** History: recent sessions list. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { cleanTitle, formatDate } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

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
        <div class="history-list">
          {sessionsQuery.data.map((session: any) => (
            <button class="history-row" key={session.id} onClick={() => app.openSession(session.id)}>
              <span class="history-date">{formatDate(session.session_date)}</span>
              <span class="history-main"><b>{cleanTitle(session.title)}</b><small>{session.exercise_count || 0} ejercicios · {session.total_sets || 0} series{session.duration_actual ? ` · ${session.duration_actual} min` : ''}</small></span>
              <span class="history-chevron">›</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
