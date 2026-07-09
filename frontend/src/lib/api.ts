/** Thin fetch wrapper: Telegram auth + timeout. Caching, dedupe, retries and
 * loading states are TanStack Query's job. */
import { tg } from './telegram';

const API = (window as any).API_BASE_URL || location.origin + '/api';

export async function apiFetch(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tg?.initData && tg.initData.length > 10) headers['X-Telegram-Init-Data'] = tg.initData;
  let r: Response;
  try {
    r = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw e?.name === 'TimeoutError' ? new Error('El servidor no responde. Prueba de nuevo.') : e;
  }
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
