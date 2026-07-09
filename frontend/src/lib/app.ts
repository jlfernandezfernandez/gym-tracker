/** App bootstrap: routing, navigation wiring and initial screen. */
import { inTelegram } from './telegram';
import { $, screen, setEmpty } from './ui';
import { onReenter, popScreen, resetStack, setPopFallback } from './nav';
import { state, loadSession } from './state';
import { initLanding } from './screens/landing';
import { renderPlan } from './screens/plan';
import { openExercise } from './screens/exercise';
import { renderHistory } from './screens/history';
import { renderRecords } from './screens/records';
import { renderProfile } from './screens/profile';

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

export function init() {
  resetStack();
  // Going back to the plan re-renders it so progress is fresh, not stale DOM.
  onReenter('plan', () => (state.plan ? renderPlan(false) : screen('plan')));
  // Share/read-only context must never go back to an unauthenticated empty home.
  setPopFallback(() => (state.readOnly && state.plan ? renderPlan(false) : screen('landing')));

  for (const id of ['plan', 'exercise', 'profile', 'history', 'records', 'record-detail']) {
    $(`${id}-back`).onclick = () => popScreen();
  }
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
        setEmpty('plan-body', '🔗', 'No pude cargar este enlace.');
      }
      return;
    }
    if (!inTelegram() && location.hostname !== 'localhost') {
      $('landing').innerHTML =
        '<div class="empty"><div class="icon">📱</div><p>Esta app vive dentro de Telegram.</p><p>Ábrela desde el chat con tu coach.</p></div>';
      return;
    }
    await initLanding();
  })();
}
