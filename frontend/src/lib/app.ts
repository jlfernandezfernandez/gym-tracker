/**
 * Gym Coach Mini App — client logic (ported from the previous vanilla build).
 */
import { renderBodyMap } from './bodymap';
import { renderProgressChart, type ProgressPoint } from './chart';

const API = (window as any).API_BASE_URL || location.origin + '/api';
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.setHeaderColor?.('#f6f7f9');
  tg.setBackgroundColor?.('#f6f7f9');
}

interface State {
  session: any;
  plan: any;
  current: any;
  readOnly: boolean;
  viewStack: string[];
}
const state: State = { session: null, plan: null, current: null, readOnly: false, viewStack: [] };

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

function pushScreen(id: string) {
  state.viewStack.push(id);
  screen(id);
}

function popScreen() {
  const prev = state.viewStack.pop();
  if (prev) {
    if (prev === 'plan' && state.plan) renderPlan(false);
    else screen(prev);
    return;
  }
  // Share/read-only context must never go back to an unauthenticated empty home.
  if (state.readOnly && state.plan) {
    renderPlan(false);
    return;
  }
  screen('landing');
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

function routeParams() {
  const p: Record<string, string> = {};
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // Only clean routes are supported:
  // /session/share/:token
  // /session/share/:token/exercise/:plannedExerciseId
  if (parts[0] === 'session' && parts[1] === 'share' && parts[2]) {
    p.share_token = parts[2];
    if (parts[3] === 'exercise' && parts[4]) p.exercise_id = parts[4];
  }
  return p;
}

function mediaUrl(url?: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : location.origin + url;
}

function splitMuscles(s?: string) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function sessionMuscles(exs: any[]) {
  return [
    ...new Set<string>(
      exs.flatMap((e: any) => [e.target, e.body_part, e.muscle_group, ...splitMuscles(e.secondary_muscles)]).filter(Boolean),
    ),
  ];
}

function completedSets(ex: any) {
  return ex.performed_sets?.length || 0;
}

function exerciseProgressPct(ex: any) {
  return ex.sets ? Math.min(100, Math.round((completedSets(ex) / ex.sets) * 100)) : 0;
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

function renderLandingActive(data: any, profile?: any) {
  const c = $('active-card');
  const greeting = profile?.name ? `Hola, ${profile.name}` : 'Hola';
  $('landing-greeting').textContent = greeting;
  c.style.display = 'block';
  c.onclick = null;
  if (!data) {
    $('landing-sub').textContent = 'Sin sesión activa. Empieza hablando con el coach.';
    c.innerHTML =
      '<div class="empty"><div class="icon">🏋️</div><p>Sin sesión activa.</p><p>Empieza hablando con el coach. Él crea el entrenamiento y te manda el botón.</p></div>';
    c.classList.remove('tap');
    return;
  }
  const p = normalize(data.session);
  state.session = data.session;
  state.plan = p;
  state.current = data.current;
  const cur = data.current;
  const pct = cur.total_sets ? Math.round((cur.completed_sets / cur.total_sets) * 100) : 0;
  const curEx = currentExercise();
  const media = mediaUrl(curEx?.gif_url || curEx?.image_url);
  const lastSet = curEx?.performed_sets?.[curEx.performed_sets.length - 1];
  $('landing-sub').textContent = 'Esta es tu sesión activa de hoy';
  // During a workout the landing IS the workout: current exercise front and center.
  c.innerHTML = `<div class="exercise-title-row"><h2>${esc(p.title || 'Entrenamiento')}</h2><span class="pill">${esc(cur.completed_sets || 0)}/${esc(cur.total_sets || 0)} series</span></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="landing-current">
      <div class="exercise-media">${media ? `<img src="${esc(media)}" loading="eager"/>` : '🏋️'}</div>
      <div class="landing-current-info">
        <h3>${esc(cur.current_exercise_name || curEx?.name || '—')}</h3>
        <p>Serie ${esc(cur.current_set_number || 1)} de ${esc(cur.target_sets || curEx?.sets || '-')}</p>
        <div class="meta"><span class="pill active">${esc(curEx?.sets || '-')}×${esc(curEx?.reps || '-')}</span><span class="pill">${lastSet ? `último: ${lastSet.weight}kg` : curEx?.weight ? `${curEx.weight}kg` : 'peso corporal'}</span></div>
      </div>
    </div>
    <button class="btn" id="landing-continue" style="margin-top:12px">▶ Continuar entreno</button>
    <button class="btn ghost" id="landing-plan" style="margin-top:8px">Ver plan completo</button>`;
  c.classList.remove('tap');
  $('landing-continue').onclick = () => {
    renderPlan(true);
    openExercise(currentExercise()?.planned_id, true);
  };
  $('landing-plan').onclick = () => renderPlan(true);
}

async function initLanding() {
  let profile: any;
  try {
    profile = await api('GET', '/profile');
  } catch {
    profile = null;
  }
  try {
    const data = await api('GET', '/sessions/active');
    renderLandingActive(data, profile);
  } catch {
    renderLandingActive(null, profile);
  }
}

function renderPlan(push = true) {
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

async function openExercise(plannedId?: string, push = true) {
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
  $('ex-title').textContent = ex.name || 'Ejercicio';
  $('ex-subtitle').textContent = `${ex.target || ex.muscle_group || ''} ${ex.equipment ? '· ' + ex.equipment : ''}`;
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
    $('ex-body').innerHTML = html;
    const slot = document.getElementById('exercise-bodymap-slot');
    if (slot) renderBodyMap(slot, muscles);
    loadProgressChart(ex);
    return;
  }
  const next = done + 1;
  // Prefill with the athlete's last logged set (they usually repeat or nudge it), else the coach suggestion.
  const last = ex.performed_sets?.[done - 1];
  html += `<div class="card"><h2>Registrar serie ${next}</h2><div class="row" style="margin-top:10px"><label><p>Peso (kg)</p><input id="kg" type="number" inputmode="decimal" step="0.5" value="${esc(last?.weight ?? ex.weight ?? 0)}"></label><label><p>Reps</p><input id="reps" type="number" inputmode="numeric" value="${esc(last?.reps ?? ex.reps ?? 10)}"></label></div><textarea id="note" style="margin-top:10px" placeholder="Nota: fácil, duro, molestia..."></textarea><button class="btn" style="margin-top:10px" id="save-set">✓ Guardar serie</button></div><button class="btn secondary" style="margin-top:10px" id="complete-ex">✓ Completar</button>`;
  $('ex-body').innerHTML = html;
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
      $('ex-body').querySelector('.card')!.after(div);
      renderProgressChart(div.querySelector('canvas')!, pts);
    })
    .catch(() => {});
}

async function saveSet(ex: any) {
  const btn = $('save-set') as HTMLButtonElement;
  if (btn.disabled) return; // double-tap guard: one in-flight save at a time
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const kg = parseFloat(($('kg') as HTMLInputElement).value || '0');
    const reps = parseInt(($('reps') as HTMLInputElement).value || '0');
    const note = ($('note') as HTMLTextAreaElement).value || '';
    if (reps <= 0) {
      btn.disabled = false;
      btn.textContent = '✓ Guardar serie';
      return toast('Pon las reps', 'err');
    }
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
    screen('exercise');
  } catch (e: any) {
    btn.disabled = false;
    btn.textContent = '✓ Guardar serie';
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
    renderPlan(false);
    popScreen();
  } catch (e: any) {
    haptic('bad');
    toast(e.message, 'err');
  }
}

async function finishSession() {
  try {
    const feedback = prompt('Feedback para el coach (opcional)') || '';
    const updated = await api('POST', '/sessions/' + state.session.id + '/finish', {
      feedback,
      energy: state.session.energy || 5,
      discomfort: state.session.discomfort || '',
    });
    state.session = updated;
    state.plan = normalize(updated);
    haptic('ok');
    toast('Sesión finalizada', 'ok');
    renderPlan(false);
    popScreen();
    initLanding();
  } catch (e: any) {
    toast(e.message, 'err');
  }
}

async function renderHistory(push = true) {
  if (push) pushScreen('history');
  try {
    const rows = await api('GET', '/sessions');
    const list = rows || [];
    if (!list.length) {
      $('hist-body').innerHTML =
        '<div class="empty"><div class="icon">📊</div><p>Sin historial todavía.<br>Empieza a entrenar con el coach.</p></div>';
      return;
    }
    $('hist-body').innerHTML = list
      .map((s: any) => {
        // Legacy titles embed the date ("Pecho · 09/07"); strip it, session_date is the source of truth.
        const title = String(s.title || 'Entrenamiento').replace(/\s*[·\-–—]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '');
        const dateStr = new Date(s.session_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        return `<div class="card tap" data-session="${s.id}"><h3>${esc(title)}</h3><p>${esc(dateStr)} · ${s.exercise_count || 0} ejercicios · ${s.total_sets || 0} series</p></div>`;
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
    $('hist-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar el historial.</p></div>';
  }
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

async function renderRecords(push = true) {
  if (push) pushScreen('records');
  try {
    const rows = await api('GET', '/exercises/records');
    if (!rows?.length) {
      $('records-body').innerHTML =
        '<div class="empty"><div class="icon">🏆</div><p>Sin marcas todavía.<br>Registra series y aparecerán aquí.</p></div>';
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
    $('records-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar las marcas.</p></div>';
  }
}

async function renderRecordDetail(exerciseId: string, name: string) {
  pushScreen('record-detail');
  $('record-title').textContent = name;
  $('record-subtitle').textContent = 'Histórico por sesión';
  try {
    const pts: (ProgressPoint & { volume: number; sets: number })[] = await api(
      'GET',
      '/exercises/' + encodeURIComponent(exerciseId) + '/progress?limit=50',
    );
    if (!pts?.length) {
      $('record-body').innerHTML = '<div class="empty"><div class="icon">📈</div><p>Sin datos todavía.</p></div>';
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
    $('record-body').innerHTML = html;
    const canvas = document.getElementById('record-chart') as HTMLCanvasElement | null;
    if (canvas) renderProgressChart(canvas, pts);
  } catch {
    $('record-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar el detalle.</p></div>';
  }
}

async function renderProfile(push = true) {
  if (push) pushScreen('profile');
  try {
    const p = await api('GET', '/profile');
    let measurements: any[] = [];
    try {
      measurements = await api('GET', '/profile/measurements?limit=8');
    } catch {}
    const latest = measurements[0];
    const fixed: [string, unknown][] = [
      ['Objetivo', p.goal],
      ['Experiencia', p.experience_level],
      ['Días/semana', p.training_days_per_week],
      ['Min/sesión', p.usual_session_minutes],
      ['Edad', p.age],
      ['Altura', p.height_cm && p.height_cm + ' cm'],
      ['Gym', p.gym_name],
    ];
    const context: [string, unknown][] = [
      ['Patologías', p.injuries],
      ['Limitaciones', p.limitations],
      ['Equipamiento', p.available_equipment],
      ['No disponible', p.unavailable_equipment],
      ['Le gustan', p.preferred_exercises],
      ['No le gustan', p.disliked_exercises],
      ['Notas', p.notes],
    ];
    const tile = (k: string, v: unknown) => `<div class="profile-tile"><b>${esc(v || '—')}</b><span>${esc(k)}</span></div>`;
    let html = `<div class="card"><h1>${esc(p.name || 'Atleta')}</h1><p>${p.onboarding_complete ? 'Perfil deportivo activo' : 'Onboarding pendiente — habla con el coach'}</p>`;
    if (latest || p.weight_kg) {
      html += `<div class="profile-grid" style="margin-top:12px">
        ${tile('Peso actual', (latest?.weight_kg || p.weight_kg) ? `${latest?.weight_kg || p.weight_kg} kg` : '—')}
        ${tile('Músculo', latest?.muscle_kg ? `${latest.muscle_kg} kg` : '—')}
        ${tile('Grasa', latest?.fat_kg ? `${latest.fat_kg} kg` : '—')}
        ${tile('Score', latest?.score || '—')}
      </div>`;
    }
    html += `</div>`;
    html += `<div class="card"><h2>Datos fijos</h2><div class="profile-grid" style="margin-top:10px">${fixed.filter(([, v]) => v).map(([k, v]) => tile(k, v)).join('')}</div></div>`;
    const contextRows = context.filter(([, v]) => v).map(([k, v]) => `<div class="set-row"><span class="n">${esc(k)}</span><span class="v" style="text-align:right;max-width:62%">${esc(v)}</span></div>`).join('');
    if (contextRows) html += `<div class="card"><h2>Contexto del coach</h2><div class="sets" style="margin-top:10px">${contextRows}</div></div>`;
    if (measurements.length) {
      html += `<div class="card"><h2>Mediciones</h2><p>Peso, composición corporal o cualquier medición futura. Cada dato con fecha y fuente.</p><div class="measure-list" style="margin-top:10px">${measurements.map((m) => {
        const d = new Date(m.measured_at).toLocaleDateString('es-ES');
        const bits = [m.weight_kg && `${m.weight_kg}kg`, m.muscle_kg && `${m.muscle_kg}kg músculo`, m.fat_kg && `${m.fat_kg}kg grasa`, m.score && `score ${m.score}`].filter(Boolean).join(' · ');
        return `<div class="measure-row"><div><b>${esc(bits || 'Medición')}</b><p>${esc(m.source || 'manual')} · ${esc(d)}${m.notes ? ' · ' + esc(m.notes) : ''}</p></div></div>`;
      }).join('')}</div></div>`;
    } else {
      html += `<div class="card"><h2>Mediciones</h2><p>Aquí irán peso, grasa, músculo, perímetros, check-ins o cualquier medición por fecha cuando el coach las añada.</p></div>`;
    }
    $('profile-body').innerHTML = html;
  } catch {
    $('profile-body').innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>No pude cargar el perfil.</p></div>';
  }
}


export function init() {
  state.viewStack = [];
  $('plan-back').onclick = () => popScreen();
  $('exercise-back').onclick = () => popScreen();
  $('profile-back').onclick = () => popScreen();
  $('history-back').onclick = () => popScreen();
  $('records-back').onclick = () => popScreen();
  $('record-back').onclick = () => popScreen();
  $('open-history').onclick = () => renderHistory(true);
  $('open-records').onclick = () => renderRecords(true);
  $('open-profile').onclick = () => renderProfile(true);

  (async () => {
    const p = routeParams();
    if (p.share_token) {
      try {
        await loadSession(null, p.share_token);
        if (p.exercise_id) openExercise(p.exercise_id, false);
        else renderPlan(false);
      } catch {
        $('plan-body').innerHTML = '<div class="empty"><div class="icon">🔗</div><p>No pude cargar este enlace.</p></div>';
      }
      return;
    }
    const inTelegram = !!(tg?.initData && tg.initData.length > 10);
    if (!inTelegram && location.hostname !== 'localhost') {
      $('landing').innerHTML =
        '<div class="empty"><div class="icon">📱</div><p>Esta app vive dentro de Telegram.</p><p>Ábrela desde el chat con tu coach.</p></div>';
      return;
    }
    await initLanding();
  })();
}
