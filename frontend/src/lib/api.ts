/** HTTP client for the gym-tracker API: Telegram auth, timeouts and
 * double-submit protection for mutations. */
import { tg } from './telegram';
import { esc } from './ui';

const API = (window as any).API_BASE_URL || location.origin + '/api';

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (tg?.initData && tg.initData.length > 10) h['X-Telegram-Init-Data'] = tg.initData;
  return h;
}

// One shared promise per identical in-flight mutation: double-taps, laggy
// webviews and impatient users all resolve to the same request.
const inflight = new Map<string, Promise<any>>();

export async function api(method: string, path: string, body?: unknown) {
  const payload = body ? JSON.stringify(body) : undefined;
  const key = method !== 'GET' ? `${method} ${path} ${payload || ''}` : '';
  if (key && inflight.has(key)) return inflight.get(key)!;

  const run = (async () => {
    const r = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: payload,
      signal: AbortSignal.timeout(15000),
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
  })().catch((e: any) => {
    throw e?.name === 'TimeoutError' ? new Error('El servidor no responde. Prueba de nuevo.') : e;
  });

  if (key) {
    inflight.set(key, run);
    run.finally(() => inflight.delete(key));
  }
  return run;
}

/** Run an async action with the button disabled and showing a busy label. */
export async function busy(btn: HTMLButtonElement, label: string, fn: () => Promise<void>) {
  if (btn.disabled) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>${esc(label)}`;
  try {
    await fn();
  } finally {
    // The button may have been re-rendered away; restoring a detached node is harmless.
    btn.disabled = false;
    btn.innerHTML = original;
  }
}
