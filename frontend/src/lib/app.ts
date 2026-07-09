/**
 * Gym Coach Mini App — client logic (ported from the previous vanilla build).
 */
import { renderBodyMap } from './bodymap';
import { renderProgressChart, type ProgressPoint } from './chart';

const API = (window as any).API_BASE_URL || location.origin + '/api';
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.setHeaderColor?.('secondary_bg_color');
}

interface State {
  session: any;
  plan: any;
  current: any;
  readOnly: boolean;
}
const state: State = { session: null, plan: null, current: null, readOnly: false };

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
const STATUS_ES: Record<string, string> = {
  pending: 'pendiente',
  in_progress: 'en curso',
  completed: 'hecho',
  skipped: 'saltado',
  changed: 'cambiado',
};

function haptic(t?: string) {
  try {
    if (!tg) return;
    t === 'ok'
      ? tg.HapticFeedback.notificationOccurred('success')
      : t === 'bad'
        ? tg.HapticFeedback.notificationOccurred('error')
        : tg.HapticFeedback.impactOccurred('light');
  } catch {}
}

function toast(msg: string, type?: string) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function screen(id: string) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  scrollTo(0, 0);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (tg?.initData && tg.initData.length > 10) h['X-Telegram-Init-Data'] = tg.initData;
  return h;
}

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let d = 'Error';
    try {
      const j = await r.json();
      d = j.detail || j.error || d;
    } catch {}
    throw new Error(d);
  }
  return r.json();
}

function normalize(s: any) {
  const pl = [...(s?.planned_exercises || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    ...s,
    exercises: pl.map((pe) => ({
      planned_id: pe.id,
      exercise_id: pe.exercise_id,
      order: pe.order,
      sets: pe.target_sets || 3,
      reps: pe.target_reps || 10,
      weight: pe.suggested_weight || 0,
      notes: pe.notes || '',
      status: pe.status || 'pending',
      performed_sets: pe.performed_sets || [],
      ...(pe.exercise || {}),
    })),
  };
}

function params() {
  return Object.fromEntries(new URLSearchParams(location.search).entries());
}

function currentExercise() {
  const id = state.current?.current_planned_exercise_id;
  return (
    state.plan?.exercises?.find((e: any) => String(e.planned_id) === String(id)) ||
    state.plan?.exercises?.find((e: any) => ['pending', 'in_progress', 'changed'].includes(e.status)) ||
    state.plan?.exercises?.[0]
  );
}

async function loadSession(id: string | null, share?: string) {
  state.readOnly = !!share && !tg?.initData; // read-only only if no Telegram auth
  const s = share
    ? await api('GET', '/sessions/share/' + encodeURIComponent(share))
    : await api('GET', '/sessions/' + encodeURIComponent(id!));
  state.session = s;
  state.plan = normalize(s);
  try {
    if (!state.readOnly) state.current = await api('GET', '/sessions/' + s.id + '/current');
  } catch {
    state.current = null;
  }
  return state.plan;
}

function renderLandingActive(data: any) {
  const c = $('active-card');
  if (!data) {
    c.innerHTML =
      '<h2>Sin sesión activa</h2><p>Empieza hablando con el coach. Él crea el entrenamiento y te manda el botón.</p>';
    ($('open-active') as HTMLButtonElement).disabled = true;
    return;
  }
  const p = normalize(data.session);
  state.session = data.session;
  state.plan = p;
  state.current = data.current;
  const cur = data.current;
  const pct = cur.total_sets ? Math.round((cur.completed_sets / cur.total_sets) * 100) : 0;
  c.innerHTML = `<h2>Sesión activa</h2><p>${esc(p.title || 'Entrenamiento')} · ${esc(cur.exercise_count || p.exercises.length)} ejercicios</p><div class="progress" style="margin-top:10px"><div style="width:${pct}%"></div></div><div class="row" style="margin-top:8px"><span class="pill active">▶ ${esc(cur.current_exercise_name || '—')}</span><span class="pill">Serie ${esc(cur.current_set_number || 1)}/${esc(cur.target_sets || '-')}</span></div>`;
}

async function initLanding() {
  try {
    const data = await api('GET', '/sessions/active');
    renderLandingActive(data);
  } catch {
    renderLandingActive(null);
  }
}

function renderPlan() {
  const p = state.plan;
  $('plan-title').textContent = p.title || 'Plan del coach';
  $('plan-subtitle').textContent = state.readOnly
    ? 'Vista compartida (solo lectura)'
    : 'Creado por el coach. Aquí se ejecuta y registra.';
  const exs = p.exercises || [];
  const done = exs.filter((e: any) => e.status === 'completed').length;
  const pct = exs.length ? Math.round((done / exs.length) * 100) : 0;
  let html = `<div class="card"><h2>${esc(p.title || 'Entrenamiento')}</h2><p>${esc(p.goal || p.coach_summary || 'Plan generado por el coach')}</p><div class="progress" style="margin-top:10px"><div style="width:${pct}%"></div></div><div class="grid stats" style="margin-top:10px"><div class="stat"><b>${exs.length}</b><span>ejercicios</span></div><div class="stat"><b>${done}/${exs.length}</b><span>hechos</span></div><div class="stat"><b>${pct}%</b><span>progreso</span></div></div></div>`;
  const muscles: string[] = [...new Set<string>(exs.map((e: any) => e.muscle_group).filter(Boolean))];
  if (muscles.length)
    html += `<div class="card"><h2>Zonas de hoy</h2><div id="bodymap-slot"></div><div class="meta" style="justify-content:center;margin-top:8px">${muscles.map((m) => `<span class="pill">${esc(m)}</span>`).join('')}</div></div>`;
  const curId = state.current?.current_planned_exercise_id;
  exs.forEach((ex: any) => {
    const isCur = String(ex.planned_id) === String(curId);
    const stEs = STATUS_ES[ex.status] || ex.status;
    html += `<div class="card tap exercise ${isCur ? 'current' : ''}" data-open="${ex.planned_id}"><div class="thumb">${ex.image_url || ex.gif_url ? `<img src="${esc(ex.image_url || ex.gif_url)}" loading="lazy"/>` : '🏋️'}</div><div class="info"><h3>${esc(ex.name || 'Ejercicio')}</h3><p>${esc(ex.muscle_group || '')} ${ex.equipment ? '· ' + esc(ex.equipment) : ''}</p><div class="meta"><span class="pill">${ex.sets}×${ex.reps}</span>${ex.weight ? `<span class="pill">${ex.weight}kg</span>` : ''}<span class="pill st-${esc(ex.status)}">${stEs}</span>${isCur ? '<span class="pill active">actual</span>' : ''}</div></div></div>`;
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
  $('plan-body').innerHTML = html;
  const slot = document.getElementById('bodymap-slot');
  if (slot) renderBodyMap(slot, muscles);
  document.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => (el.onclick = () => openExercise(el.dataset.open!)));
  document.getElementById('open-current')?.addEventListener('click', () => openExercise(currentExercise()?.planned_id));
  document.getElementById('finish')?.addEventListener('click', finishSession);
  screen('plan');
}

async function openExercise(plannedId?: string) {
  if (!plannedId) return toast('No hay ejercicio actual', 'err');
  if (!state.current && state.session && !state.readOnly) {
    try {
      state.current = await api('GET', '/sessions/' + state.session.id + '/current');
    } catch {}
  }
  const ex = state.plan.exercises.find((e: any) => String(e.planned_id) === String(plannedId));
  if (!ex) return toast('Ejercicio no encontrado', 'err');
  renderExercise(ex);
  screen('exercise');
}

function renderExercise(ex: any) {
  $('ex-title').textContent = ex.name || 'Ejercicio';
  $('ex-subtitle').textContent = `${ex.muscle_group || ''} ${ex.equipment ? '· ' + ex.equipment : ''}`;
  const done = ex.performed_sets?.length || 0;
  const instructions =
    ex.instructions_es || ex.instructions || ex.notes || 'Sigue las indicaciones del coach en Telegram.';
  let html = `<div class="big-media">${ex.gif_url || ex.image_url ? `<img src="${esc(ex.gif_url || ex.image_url)}" loading="lazy"/>` : '🏋️'}</div><div class="card"><h2>${esc(ex.name || 'Ejercicio')}</h2><p class="instr" style="margin-top:6px" onclick="this.classList.toggle('open')">${esc(instructions)}</p><div class="meta" style="margin-top:10px"><span class="pill">Objetivo: ${ex.sets}×${ex.reps}</span>${ex.weight ? `<span class="pill">${ex.weight}kg sugerido</span>` : ''}<span class="pill">${done} hechas</span></div></div>`;
  if (done > 0) {
    html += '<div class="card"><h3>Series registradas</h3><div class="sets" style="margin-top:8px">';
    (ex.performed_sets || []).forEach((s: any) => {
      html += `<div class="set-row"><span class="n">Serie ${s.set_number}</span><span class="v">${s.reps} reps · ${s.weight}kg</span></div>`;
    });
    html += '</div></div>';
  }
  if (state.readOnly) {
    $('ex-body').innerHTML = html;
    loadProgressChart(ex);
    return;
  }
  const next = done + 1;
  html += `<div class="card"><h2>Registrar serie ${next}</h2><div class="row" style="margin-top:10px"><label><p>Peso (kg)</p><input id="kg" type="number" inputmode="decimal" step="0.5" value="${esc(ex.weight || 0)}"></label><label><p>Reps</p><input id="reps" type="number" inputmode="numeric" value="${esc(ex.reps || 10)}"></label></div><textarea id="note" style="margin-top:10px" placeholder="Nota: fácil, duro, molestia..."></textarea><button class="btn" style="margin-top:10px" id="save-set">✓ Guardar serie</button></div><button class="btn secondary" style="margin-top:10px" id="complete-ex">✓ Completar</button>`;
  $('ex-body').innerHTML = html;
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
      $('ex-body').querySelector('.card')!.after(div);
      renderProgressChart(div.querySelector('canvas')!, pts);
    })
    .catch(() => {});
}

async function saveSet(ex: any) {
  try {
    const kg = parseFloat(($('kg') as HTMLInputElement).value || '0');
    const reps = parseInt(($('reps') as HTMLInputElement).value || '0');
    const note = ($('note') as HTMLTextAreaElement).value || '';
    if (reps <= 0) return toast('Pon las reps', 'err');
    const updated = await api('POST', `/sessions/${state.session.id}/exercises/${ex.planned_id}/sets`, {
      set_number: (ex.performed_sets?.length || 0) + 1,
      weight: kg,
      reps,
      sensation: note.toLowerCase().includes('molest') ? 'molestia' : 'ok',
      notes: note,
    });
    state.session = updated;
    state.plan = normalize(updated);
    try {
      state.current = await api('GET', '/sessions/' + updated.id + '/current');
    } catch {}
    haptic('ok');
    toast('Serie guardada', 'ok');
    const fresh = state.plan.exercises.find((e: any) => e.planned_id === ex.planned_id);
    renderExercise(fresh);
  } catch (e: any) {
    haptic('bad');
    toast(e.message, 'err');
  }
}

async function completeExercise(ex: any) {
  try {
    const updated = await api('POST', `/sessions/${state.session.id}/exercises/${ex.planned_id}/complete`);
    state.session = updated;
    state.plan = normalize(updated);
    try {
      state.current = await api('GET', '/sessions/' + updated.id + '/current');
    } catch {}
    haptic('ok');
    toast('Ejercicio completado', 'ok');
    renderPlan();
  } catch (e: any) {
    haptic('bad');
    toast(e.message, 'err');
  }
}

async function finishSession() {
  try {
    const feedback = prompt('Feedback para el coach (opcional)') || '';
    const updated = await api('POST', '/sessions/' + state.session.id + '/finish', {
      duration_actual: 0,
      feedback,
      energy: state.session.energy || 5,
      discomfort: state.session.discomfort || '',
    });
    state.session = updated;
    state.plan = normalize(updated);
    haptic('ok');
    toast('Sesión finalizada', 'ok');
    renderPlan();
  } catch (e: any) {
    toast(e.message, 'err');
  }
}

async function renderHistory() {
  screen('history');
  try {
    const rows = await api('GET', '/sessions');
    const list = rows || [];
    if (!list.length) {
      $('hist-body').innerHTML =
        '<div class="empty"><div class="icon">📊</div><p>Sin historial todavía.<br>Empieza a entrenar con el coach.</p></div>';
      return;
    }
    $('hist-body').innerHTML = list
      .map(
        (s: any) =>
          `<div class="card tap" data-session="${s.id}"><h3>${esc(s.title || 'Entrenamiento')}</h3><p>${esc(s.session_date)} · ${s.exercise_count || 0} ejercicios · ${s.total_sets || 0} series</p></div>`,
      )
      .join('');
    document.querySelectorAll<HTMLElement>('[data-session]').forEach(
      (el) =>
        (el.onclick = async () => {
          await loadSession(el.dataset.session!);
          renderPlan();
        }),
    );
  } catch {
    $('hist-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar el historial.</p></div>';
  }
}

async function renderProfile() {
  screen('profile');
  try {
    const p = await api('GET', '/profile');
    const F: [string, unknown][] = [
      ['Objetivo', p.goal],
      ['Experiencia', p.experience_level],
      ['Días/semana', p.training_days_per_week],
      ['Minutos/sesión', p.usual_session_minutes],
      ['Edad', p.age],
      ['Altura', p.height_cm && p.height_cm + ' cm'],
      ['Peso', p.weight_kg && p.weight_kg + ' kg'],
      ['Lesiones', p.injuries],
      ['Limitaciones', p.limitations],
      ['Gym', p.gym_name],
      ['Equipamiento', p.available_equipment],
      ['No disponible', p.unavailable_equipment],
      ['Le gustan', p.preferred_exercises],
      ['No le gustan', p.disliked_exercises],
      ['Notas', p.notes],
    ];
    const rows = F.filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<div class="set-row"><span class="n">${esc(k)}</span><span class="v" style="text-align:right;max-width:60%">${esc(v)}</span></div>`,
      )
      .join('');
    let html = `<div class="card"><h2>${esc(p.name || 'Atleta')}</h2><p>${p.onboarding_complete ? 'Onboarding completo ✓' : 'Onboarding pendiente — habla con el coach'}</p></div>`;
    html += rows
      ? `<div class="card"><div class="sets">${rows}</div></div>`
      : '<div class="empty"><div class="icon">👤</div><p>Perfil vacío.<br>El coach lo rellena conversando contigo.</p></div>';
    $('profile-body').innerHTML = html;
  } catch {
    $('profile-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar el perfil.</p></div>';
  }
}

export function init() {
  document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) => (b.onclick = () => screen(b.dataset.back!)));
  $('open-active').onclick = () => (state.plan ? renderPlan() : toast('No hay sesión activa', 'err'));
  $('open-history').onclick = renderHistory;
  $('open-profile').onclick = renderProfile;

  (async () => {
    const p = params();
    if (p.share_token) {
      try {
        await loadSession(null, p.share_token);
        renderPlan();
      } catch {
        $('plan-body').innerHTML = '<div class="empty"><div class="icon">🔗</div><p>No pude cargar este enlace.</p></div>';
      }
      return;
    }
    if (p.session_id) {
      try {
        await loadSession(p.session_id);
        if (p.exercise_id) openExercise(p.exercise_id);
        else renderPlan();
      } catch {
        $('plan-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar la sesión.</p></div>';
      }
      return;
    }
    // Plain browser without Telegram identity: the API can't know who you
    // are, so don't pretend to be an app. localhost keeps working for dev.
    const inTelegram = !!(tg?.initData && tg.initData.length > 10);
    if (!inTelegram && location.hostname !== 'localhost') {
      $('active-card').innerHTML =
        '<h2>Esta Mini App vive dentro de Telegram</h2><p>Ábrela desde el chat con tu coach: él te manda el botón. En el navegador solo se pueden ver rutinas compartidas con enlace.</p><p style="margin-top:8px"><a href="https://jlfernandezfernandez.github.io/gym-tracker/" style="color:var(--text);text-decoration:underline">Conoce el proyecto</a></p>';
      (document.querySelector('.grid') as HTMLElement).style.display = 'none';
      return;
    }
    await initLanding();
  })();
}
