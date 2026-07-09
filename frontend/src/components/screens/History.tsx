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
      <TopBar title="Historial" subtitle="Últimas sesiones" onBack={app.pop} />
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
        sessionsQuery.data.map((session: any) => (
          <div class="card tap" key={session.id} onClick={() => app.openSession(session.id)}>
            <h3>{cleanTitle(session.title)}</h3>
            <p>
              {formatDate(session.session_date)} · {session.exercise_count || 0} ejercicios · {session.total_sets || 0} series
            </p>
          </div>
        ))
      )}
    </>
  );
}
