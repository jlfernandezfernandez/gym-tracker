/** Personal records: max weight per exercise + per-session detail. */
import { renderProgressChart, type ProgressPoint } from '../chart';
import { api } from '../api';
import { $, esc, fmtDate, setEmpty, setLoading } from '../ui';
import { pushScreen } from '../nav';
import { mediaUrl } from '../state';

export async function renderRecords(push = true) {
  if (push) pushScreen('records');
  setLoading('records-body');
  try {
    const rows = await api('GET', '/exercises/records');
    if (!rows?.length) {
      setEmpty('records-body', '🏆', 'Sin marcas todavía.<br>Registra series y aparecerán aquí.');
      return;
    }
    $('records-body').innerHTML = rows
      .map(
        (r: any) => `<div class="card tap exercise-card" data-record="${r.exercise_id}" data-name="${esc(r.name)}">
          <div class="exercise-media">${r.image_url ? `<img src="${esc(mediaUrl(r.image_url))}" loading="lazy"/>` : '🏋️'}</div>
          <div class="exercise-card-body"><div class="exercise-title-row"><h3>${esc(r.name)}</h3><span class="pill active">${r.max_weight ? r.max_weight + 'kg' : 'corporal'}</span></div>
          <p>${esc(r.muscle_group || '')}${r.equipment ? ' · ' + esc(r.equipment) : ''}</p>
          <div class="meta"><span class="pill">${esc(fmtDate(r.last_date))}</span><span class="pill">${r.sessions} ${r.sessions === 1 ? 'sesión' : 'sesiones'}</span></div></div></div>`,
      )
      .join('');
    document.querySelectorAll<HTMLElement>('[data-record]').forEach(
      (el) => (el.onclick = () => renderRecordDetail(el.dataset.record!, el.dataset.name || 'Ejercicio')),
    );
  } catch {
    setEmpty('records-body', '⚠️', 'No pude cargar las marcas.');
  }
}

async function renderRecordDetail(exerciseId: string, name: string) {
  pushScreen('record-detail');
  $('record-detail-title').textContent = name;
  $('record-detail-subtitle').textContent = 'Histórico por sesión';
  setLoading('record-detail-body');
  try {
    const pts: (ProgressPoint & { volume: number; sets: number })[] = await api(
      'GET',
      '/exercises/' + encodeURIComponent(exerciseId) + '/progress?limit=50',
    );
    if (!pts?.length) {
      setEmpty('record-detail-body', '📈', 'Sin datos todavía.');
      return;
    }
    const max = Math.max(...pts.map((p) => p.top_weight || 0));
    let html = `<div class="card"><div class="grid stats"><div class="stat"><b>${max ? max + 'kg' : '—'}</b><span>máximo</span></div><div class="stat"><b>${pts.length}</b><span>sesiones</span></div><div class="stat"><b>${pts[pts.length - 1].top_weight}kg</b><span>última</span></div></div></div>`;
    if (pts.length >= 2)
      html += '<div class="card"><h3>Progresión</h3><p style="font-size:12px">Peso máximo por sesión</p><div class="chart-wrap"><canvas id="record-chart"></canvas></div></div>';
    html += `<div class="card"><h3>Sesiones</h3><div class="sets" style="margin-top:8px">${[...pts]
      .reverse()
      .map((p: any) => `<div class="set-row"><span class="n">${esc(fmtDate(p.date))}</span><span class="v">${p.top_weight}kg máx · ${p.sets} series · ${Math.round(p.volume)}kg vol</span></div>`)
      .join('')}</div></div>`;
    $('record-detail-body').innerHTML = html;
    const canvas = document.getElementById('record-chart') as HTMLCanvasElement | null;
    if (canvas) renderProgressChart(canvas, pts);
  } catch {
    setEmpty('record-detail-body', '⚠️', 'No pude cargar el detalle.');
  }
}
