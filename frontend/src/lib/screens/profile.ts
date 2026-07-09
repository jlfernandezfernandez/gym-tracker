/** Profile screen: athlete data, coach context and measurements. */
import { api } from '../api';
import { $, esc, setEmpty, setLoading } from '../ui';
import { pushScreen } from '../nav';

export async function renderProfile(push = true) {
  if (push) pushScreen('profile');
  setLoading('profile-body');
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
    setEmpty('profile-body', '⚠️', 'No pude cargar el perfil.');
  }
}
