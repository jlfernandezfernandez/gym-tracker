/** DOM and formatting helpers shared by all screens. */

export const $ = (id: string) => document.getElementById(id)!;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);

export const STATUS_ES: Record<string, string> = {
  pending: 'pendiente',
  in_progress: 'en curso',
  completed: 'hecho',
  skipped: 'saltado',
  changed: 'cambiado',
};

export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function toast(msg: string, type?: string) {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

export function screen(id: string) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  scrollTo(0, 0);
}

export function setLoading(elId: string, msg = 'Cargando...') {
  $(elId).innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

export function setEmpty(elId: string, icon: string, msg: string) {
  $(elId).innerHTML = `<div class="empty"><div class="icon">${icon}</div><p>${msg}</p></div>`;
}
