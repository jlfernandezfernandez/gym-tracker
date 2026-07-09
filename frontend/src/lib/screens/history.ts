/** History screen: recent sessions list. */
import { api } from '../api';
import { $, esc, fmtDate, setEmpty, setLoading } from '../ui';
import { pushScreen } from '../nav';
import { loadSession } from '../state';
import { renderPlan } from './plan';

export async function renderHistory(push = true) {
  if (push) pushScreen('history');
  setLoading('history-body');
  try {
    const rows = await api('GET', '/sessions');
    const list = rows || [];
    if (!list.length) {
      setEmpty('history-body', '📊', 'Sin historial todavía.<br>Empieza a entrenar con el coach.');
      return;
    }
    $('history-body').innerHTML = list
      .map((s: any) => {
        // Legacy titles embed the date ("Pecho · 09/07"); strip it, session_date is the source of truth.
        const title = String(s.title || 'Entrenamiento').replace(/\s*[·\-–—]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '');
        return `<div class="card tap" data-session="${s.id}"><h3>${esc(title)}</h3><p>${esc(fmtDate(s.session_date))} · ${s.exercise_count || 0} ejercicios · ${s.total_sets || 0} series</p></div>`;
      })
      .join('');
    document.querySelectorAll<HTMLElement>('[data-session]').forEach(
      (el) =>
        (el.onclick = async () => {
          await loadSession(el.dataset.session!);
          renderPlan(true);
        }),
    );
  } catch {
    setEmpty('history-body', '⚠️', 'No pude cargar el historial.');
  }
}
