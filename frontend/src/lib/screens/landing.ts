/** Landing screen: greeting + active session card. */
import { api } from '../api';
import { $, esc } from '../ui';
import { state, normalize, mediaUrl, currentExercise } from '../state';
import { renderPlan } from './plan';
import { openExercise } from './exercise';

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

export async function initLanding() {
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
