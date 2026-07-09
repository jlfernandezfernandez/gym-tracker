/** Exercise screen: detail, set logging and completion. */
import { renderBodyMap } from '../bodymap';
import { renderProgressChart, type ProgressPoint } from '../chart';
import { api, busy } from '../api';
import { haptic } from '../telegram';
import { $, esc, screen, toast } from '../ui';
import { pushScreen, popScreen } from '../nav';
import { state, mediaUrl, sessionMuscles, refreshSession } from '../state';
import { renderPlan } from './plan';

export async function openExercise(plannedId?: string, push = true) {
  if (!plannedId) return toast('No hay ejercicio actual', 'err');
  if (!state.current && state.session && !state.readOnly) {
    try {
      state.current = await api('GET', '/sessions/' + state.session.id + '/current');
    } catch {}
  }
  const ex = state.plan.exercises.find((e: any) => String(e.planned_id) === String(plannedId));
  if (!ex) return toast('Ejercicio no encontrado', 'err');
  renderExercise(ex);
  if (push) pushScreen('exercise');
  else screen('exercise');
}

function renderExercise(ex: any) {
  $('exercise-title').textContent = ex.name || 'Ejercicio';
  $('exercise-subtitle').textContent = `${ex.target || ex.muscle_group || ''} ${ex.equipment ? '· ' + ex.equipment : ''}`;
  const done = ex.performed_sets?.length || 0;
  const instructions = ex.instructions_es || ex.instructions || ex.notes || 'Sigue las indicaciones del coach en Telegram.';
  const media = mediaUrl(ex.gif_url || ex.image_url);
  const muscles = sessionMuscles([ex]);
  let html = `<div class="exercise-hero"><div class="big-media">${media ? `<img src="${esc(media)}" loading="eager"/>` : '🏋️'}</div>
    <div class="card"><div class="exercise-title-row"><h2>${esc(ex.name || 'Ejercicio')}</h2><span class="pill active">${done}/${ex.sets}</span></div>
    <div class="set-dots">${Array.from({ length: ex.sets || 0 }, (_, i) => `<span class="${i < done ? 'done' : i === done ? 'next' : ''}">${i + 1}</span>`).join('')}</div>
    <div class="meta"><span class="pill active">${ex.sets}×${ex.reps}</span>${ex.weight ? `<span class="pill">${ex.weight}kg sugerido</span>` : '<span class="pill">peso corporal</span>'}<span class="pill">${esc(ex.equipment || '')}</span></div></div></div>`;
  if (muscles.length) html += `<div class="card compact-map"><h2>Músculos</h2><div id="exercise-bodymap-slot"></div></div>`;
  html += `<details class="card details-card"><summary>Técnica y notas</summary><p class="instr open">${esc(instructions)}</p>${ex.notes ? `<p style="margin-top:8px">${esc(ex.notes)}</p>` : ''}</details>`;
  if (done > 0) {
    html += '<div class="card"><h3>Series registradas</h3><div class="sets" style="margin-top:8px">';
    (ex.performed_sets || []).forEach((s: any) => {
      html += `<div class="set-row"><span class="n">Serie ${s.set_number}</span><span class="v">${s.reps} reps · ${s.weight}kg</span></div>`;
    });
    html += '</div></div>';
  }
  if (state.readOnly) {
    $('exercise-body').innerHTML = html;
    const slot = document.getElementById('exercise-bodymap-slot');
    if (slot) renderBodyMap(slot, muscles);
    loadProgressChart(ex);
    return;
  }
  const next = done + 1;
  // Prefill with the athlete's last logged set (they usually repeat or nudge it), else the coach suggestion.
  const last = ex.performed_sets?.[done - 1];
  html += `<div class="card"><h2>Registrar serie ${next}</h2><div class="row" style="margin-top:10px"><label><p>Peso (kg)</p><input id="kg" type="number" inputmode="decimal" step="0.5" value="${esc(last?.weight ?? ex.weight ?? 0)}"></label><label><p>Reps</p><input id="reps" type="number" inputmode="numeric" value="${esc(last?.reps ?? ex.reps ?? 10)}"></label></div><textarea id="note" style="margin-top:10px" placeholder="Nota: fácil, duro, molestia..."></textarea><button class="btn" style="margin-top:10px" id="save-set">✓ Guardar serie</button></div><button class="btn secondary" style="margin-top:10px" id="complete-ex">✓ Completar</button>`;
  $('exercise-body').innerHTML = html;
  const slot = document.getElementById('exercise-bodymap-slot');
  if (slot) renderBodyMap(slot, muscles);
  loadProgressChart(ex);
  $('save-set').onclick = () => saveSet(ex);
  $('complete-ex').onclick = () => completeExercise(ex);
}

function loadProgressChart(ex: any) {
  api('GET', '/exercises/' + ex.exercise_id + '/progress?limit=12')
    .then((pts: ProgressPoint[]) => {
      if (!pts || pts.length < 2) return;
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML =
        '<h3>Progresión</h3><p style="font-size:12px">Peso máximo por sesión</p><div class="chart-wrap"><canvas></canvas></div>';
      $('exercise-body').querySelector('.card')!.after(div);
      renderProgressChart(div.querySelector('canvas')!, pts);
    })
    .catch(() => {});
}

async function saveSet(ex: any) {
  const kg = parseFloat(($('kg') as HTMLInputElement).value || '0');
  const reps = parseInt(($('reps') as HTMLInputElement).value || '0');
  const note = ($('note') as HTMLTextAreaElement).value || '';
  if (reps <= 0) return toast('Pon las reps', 'err');
  await busy($('save-set') as HTMLButtonElement, 'Guardando...', async () => {
    try {
      const updated = await api('POST', `/sessions/${state.session.id}/exercises/${ex.planned_id}/sets`, {
        set_number: (ex.performed_sets?.length || 0) + 1,
        weight: kg,
        reps,
        sensation: note.toLowerCase().includes('molest') ? 'molestia' : 'ok',
        notes: note,
      });
      await refreshSession(updated);
      haptic('ok');
      toast('Serie guardada', 'ok');
      const fresh = state.plan.exercises.find((e: any) => e.planned_id === ex.planned_id);
      renderExercise(fresh);
      screen('exercise');
    } catch (e: any) {
      haptic('bad');
      toast(e.message, 'err');
    }
  });
}

async function completeExercise(ex: any) {
  await busy($('complete-ex') as HTMLButtonElement, 'Completando...', async () => {
    try {
      const updated = await api('POST', `/sessions/${state.session.id}/exercises/${ex.planned_id}/complete`);
      await refreshSession(updated);
      haptic('ok');
      toast('Ejercicio completado', 'ok');
      renderPlan(false);
      popScreen();
    } catch (e: any) {
      haptic('bad');
      toast(e.message, 'err');
    }
  });
}
