/** History: recent sessions list. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { cleanTitle, fmtDate } from '../../lib/helpers';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

export function History() {
  const app = useApp();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => apiFetch('GET', '/sessions') });

  return (
    <>
      <TopBar title="Historial" subtitle="Últimas sesiones" onBack={app.pop} />
      {sessions.isLoading ? (
        <Loading />
      ) : sessions.isError ? (
        <Empty icon="⚠️">No pude cargar el historial.</Empty>
      ) : !sessions.data?.length ? (
        <Empty icon="📊">
          Sin historial todavía.
          <br />
          Empieza a entrenar con el coach.
        </Empty>
      ) : (
        sessions.data.map((s: any) => (
          <div class="card tap" key={s.id} onClick={() => app.openSession(s.id)}>
            <h3>{cleanTitle(s.title)}</h3>
            <p>
              {fmtDate(s.session_date)} · {s.exercise_count || 0} ejercicios · {s.total_sets || 0} series
            </p>
          </div>
        ))
      )}
    </>
  );
}
