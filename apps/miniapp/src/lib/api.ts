/** Thin fetch wrapper: Telegram auth + timeout. Caching, dedupe, retries and
 * loading states are TanStack Query's job. */
import { tg } from './telegram';

const API_BASE = location.origin + '/api';

export async function apiFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
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
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}
