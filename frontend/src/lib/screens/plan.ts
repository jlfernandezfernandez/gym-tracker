/** Plan screen: session overview, exercise list, share and finish. */
import { renderBodyMap } from '../bodymap';
import { api, busy } from '../api';
import { haptic } from '../telegram';
import { $, esc, screen, toast, STATUS_ES } from '../ui';
import { pushScreen, popScreen } from '../nav';
import { state, normalize, completedSets, exerciseProgressPct, mediaUrl, sessionMuscles, currentExercise } from '../state';
import { openExercise } from './exercise';
import { initLanding } from './landing';

export function renderPlan(push = true) {
  const p = state.plan;
  $('plan-title').textContent = p.title || 'Plan del coach';
  $('plan-subtitle').textContent = state.readOnly
    ? 'Plan compartido contigo'
    : 'Creado por el coach. Aquí se ejecuta y registra.';
  ($('plan-back') as HTMLButtonElement).style.display = state.readOnly ? 'none' : '';
  ($('exercise-back') as HTMLButtonElement).style.display = '';
  const exs = p.exercises || [];
  const doneEx = exs.filter((e: any) => e.status === 'completed').length;
  const doneSets = exs.reduce((a: number, e: any) => a + completedSets(e), 0);
  const totalSets = exs.reduce((a: number, e: any) => a + (e.sets || 0), 0);
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const muscles: string[] = sessionMuscles(exs);
  const heroMedia = mediaUrl(exs.find((e: any) => e.gif_url || e.image_url)?.gif_url || exs.find((e: any) => e.image_url)?.image_url);
  let html = `<div class="session-hero card">
    ${heroMedia ? `<div class="session-hero-media"><img src="${esc(heroMedia)}" loading="eager"/></div>` : ''}
    <div class="session-hero-content"><div class="meta"><span class="pill active">${esc(STATUS_ES[p.status] || p.status)}</span><span class="pill">${esc(p.duration_estimated || 0)} min</span></div>
    <h1>${esc(p.title || 'Entrenamiento')}</h1><p>${esc(p.goal || p.coach_summary || 'Plan generado por el coach')}</p>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="grid stats" style="margin-top:10px"><div class="stat"><b>${exs.length}</b><span>ejercicios</span></div><div class="stat"><b>${doneSets}/${totalSets}</b><span>series</span></div><div class="stat"><b>${pct}%</b><span>progreso</span></div></div></div></div>`;
  if (muscles.length)
    html += `<div class="card"><h2>Mapa muscular de hoy</h2><div id="bodymap-slot"></div><div class="meta muscle-cloud">${muscles.slice(0, 10).map((m) => `<span class="pill">${esc(m)}</span>`).join('')}</div></div>`;
  const curId = state.current?.current_planned_exercise_id;
  exs.forEach((ex: any) => {
    const isCur = String(ex.planned_id) === String(curId);
    const stEs = STATUS_ES[ex.status] || ex.status;
    const media = mediaUrl(ex.gif_url || ex.image_url);
    const epct = exerciseProgressPct(ex);
    html += `<div class="card tap exercise-card ${isCur ? 'current' : ''}" data-open="${ex.planned_id}">
      <div class="exercise-media">${media ? `<img src="${esc(media)}" loading="lazy"/>` : '🏋️'}</div>
      <div class="exercise-card-body"><div class="exercise-title-row"><h3>${esc(ex.name || 'Ejercicio')}</h3><span class="pill">${completedSets(ex)}/${ex.sets}</span></div>
      <p>${esc(ex.target || ex.muscle_group || '')}${ex.equipment ? ' · ' + esc(ex.equipment) : ''}</p>
      <div class="progress mini"><div style="width:${epct}%"></div></div>
      <div class="meta"><span class="pill active">${ex.sets}×${ex.reps}</span>${ex.weight ? `<span class="pill">${ex.weight}kg</span>` : '<span class="pill">peso corporal</span>'}<span class="pill st-${esc(ex.status)}">${stEs}</span>${isCur ? '<span class="pill active">actual</span>' : ''}</div></div></div>`;
  });
  if (p.status === 'completed') {
    const vol = exs.reduce(
      (a: number, e: any) => a + (e.performed_sets || []).reduce((x: number, ps: any) => x + ps.weight * ps.reps, 0),
      0,
    );
    const tsets = exs.reduce((a: number, e: any) => a + (e.performed_sets || []).length, 0);
    html += `<div class="card"><h2>Sesión completada</h2>${p.feedback ? `<p>${esc(p.feedback)}</p>` : ''}<div class="grid stats" style="margin-top:10px"><div class="stat"><b>${tsets}</b><span>series</span></div><div class="stat"><b>${Math.round(vol)}</b><span>kg volumen</span></div><div class="stat"><b>${p.duration_actual || p.duration_estimated || 0}min</b><span>duración</span></div></div></div>`;
  }
  if (!state.readOnly && p.status !== 'completed')
    html += `<div class="row" style="margin-top:12px"><button class="btn" id="open-current">▶ Ejercicio actual</button><button class="btn secondary" id="finish">✓ Finalizar</button></div>`;
  if (!state.readOnly && p.share_token)
    html += `<button class="btn ghost" id="share-plan" style="margin-top:10px">🔗 Compartir con un compañero</button>`;
  $('plan-body').innerHTML = html;
  const slot = document.getElementById('bodymap-slot');
  if (slot) renderBodyMap(slot, muscles);
  document.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => (el.onclick = () => openExercise(el.dataset.open!, true)));
  document.getElementById('open-current')?.addEventListener('click', () => openExercise(currentExercise()?.planned_id));
  document.getElementById('finish')?.addEventListener('click', finishSession);
  document.getElementById('share-plan')?.addEventListener('click', () => sharePlan(p));
  if (push) pushScreen('plan');
  else screen('plan');
}

async function sharePlan(p: any) {
  const url = `${location.origin}/session/share/${encodeURIComponent(p.share_token)}`;
  try {
    await navigator.clipboard.writeText(url);
    haptic('ok');
    toast('Enlace copiado — pásaselo a tu compañero', 'ok');
  } catch {
    // Clipboard can be blocked (Telegram webview) — fall back to the native share sheet.
    if (navigator.share) navigator.share({ title: p.title || 'Entrenamiento', url }).catch(() => {});
    else prompt('Copia el enlace:', url);
  }
}

function finishSession() {
  const dlg = $('finish-dialog') as HTMLDialogElement;
  const fb = $('finish-feedback') as HTMLTextAreaElement;
  fb.value = '';
  dlg.showModal();
  ($('finish-cancel') as HTMLButtonElement).onclick = () => dlg.close();
  ($('finish-confirm') as HTMLButtonElement).onclick = () =>
    busy($('finish-confirm') as HTMLButtonElement, 'Finalizando...', async () => {
      try {
        const updated = await api('POST', '/sessions/' + state.session.id + '/finish', {
          feedback: fb.value || '',
          energy: state.session.energy || 5,
          discomfort: state.session.discomfort || '',
        });
        dlg.close();
        state.session = updated;
        state.plan = normalize(updated);
        haptic('ok');
        toast('Sesión finalizada', 'ok');
        renderPlan(false);
        popScreen();
        initLanding();
      } catch (e: any) {
        haptic('bad');
        toast(e.message, 'err');
      }
    });
}
