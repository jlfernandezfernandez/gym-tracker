/** Thin fetch wrapper: Telegram auth + timeout. Caching, dedupe, retries and
 * loading states are TanStack Query's job. */
import { demoFetch, isDemoMode } from './demo';
import { tg } from './telegram';
import { getSetJournal } from './set-journal';

const API_BASE = location.origin + '/api';

export async function apiFetch<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (isDemoMode()) return demoFetch(method, path) as Promise<T>;

  const sessionId = path.match(/^\/sessions\/(\d+)(?:\/|$)/)?.[1];
  const isSetLog = method === 'POST' && /^\/sessions\/\d+\/exercises\/\d+\/sets$/.test(path);
  const journal = getSetJournal();
  const authenticatedRequest = async () => {
    const result = await request<T>(method, path, body);
    if (getSetJournal() !== journal) throw new Error('El usuario ha cambiado. Reabre la app.');
    return result;
  };
  if (method !== 'GET' && sessionId && !isSetLog && journal) {
    return journal.guard(Number(sessionId), authenticatedRequest,
      method === 'DELETE' && path === `/sessions/${sessionId}`);
  }
  return authenticatedRequest();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tg?.initData && tg.initData.length > 10) headers['X-Telegram-Init-Data'] = tg.initData;

  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error: any) {
    throw error?.name === 'TimeoutError' ? new Error('El servidor no responde. Prueba de nuevo.') : error;
  }

  if (!response.ok) {
    let detail = 'Error';
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || errorBody.error || detail;
    } catch {}
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.json() as Promise<T>;
}
