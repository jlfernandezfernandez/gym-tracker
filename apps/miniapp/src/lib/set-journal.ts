/** Durable submitted sets, scoped to one Telegram user. No auth tokens are stored. */
export type PendingSet = {
  sessionId: number;
  plannedId: number;
  payload: Record<string, any> & { request_id: string; set_number: number };
  error?: string;
  blocked?: boolean;
};
type JournalState = { version: 1; activeId?: number; sessions: Record<number, any>; pending: PendingSet[] };
type Request = (method: string, path: string, body?: any) => Promise<any>;

export class SetJournal {
  readonly key: string;
  constructor(
    readonly user: string,
    private storage: Pick<Storage, "getItem" | "setItem">,
    private lock: <T>(action: () => Promise<T>) => Promise<T>,
    private changed: (error?: string) => void = () => {},
  ) { this.key = `gym-set-journal-v1:${user}`; }

  read(): JournalState {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { version: 1, sessions: {}, pending: [] };
    const state = JSON.parse(raw);
    if (state.version !== 1 || !state.sessions || !Array.isArray(state.pending)) {
      throw new Error("No se puede leer el registro local. Conserva los datos del navegador.");
    }
    return state;
  }

  private write(state: JournalState) {
    try { this.storage.setItem(this.key, JSON.stringify(state)); }
    catch { throw new Error("No se pudo guardar en este dispositivo. No cierres la app; libera espacio o permite el almacenamiento y reintenta."); }
    this.changed();
  }

  private cacheSession(state: JournalState, session: any) {
    const { share_token: _shareToken, ...snapshot } = session;
    const pending = state.pending.some(item => item.sessionId === session.id);
    const active = ["planned", "in_progress"].includes(session.status);
    if (active || pending) state.sessions[session.id] = snapshot;
    else delete state.sessions[session.id];
    if (active) state.activeId = session.id;
    else if (state.activeId === session.id) delete state.activeId;
  }

  async remember(session: any) {
    await this.lock(async () => {
      const state = this.read();
      this.cacheSession(state, session);
      // Keep only the active session and sessions with unresolved writes.
      for (const id of Object.keys(state.sessions)) {
        if (+id !== state.activeId && !state.pending.some(item => item.sessionId === +id)) delete state.sessions[+id];
      }
      this.write(state);
    });
  }

  view(id: number, source = this.read().sessions[id]) {
    if (!source) return undefined;
    const session = structuredClone(source);
    for (const item of this.read().pending.filter(item => item.sessionId === id)) {
      const planned = session.planned_exercises.find((pe: any) => pe.id === item.plannedId);
      if (!planned) continue;
      // An unresolved write stays visibly pending even if a refetch saw its server result.
      planned.performed_sets = planned.performed_sets.filter((set: any) => set.set_number !== item.payload.set_number);
      planned.performed_sets.push({ ...item.payload, id: item.payload.request_id, pending: true, error: item.error });
    }
    return session;
  }

  async enqueue(sessionId: number, plannedId: number, payload: Record<string, any>) {
    return this.lock(async () => {
      const state = this.read();
      const session = state.sessions[sessionId];
      if (!session) throw new Error("Abre la sesión con conexión antes de registrar series.");
      if (state.pending.some(item => item.sessionId === sessionId && item.plannedId === plannedId && item.payload.set_number === payload.set_number)) {
        throw new Error("Esta serie ya está pendiente en otra pestaña.");
      }
      const planned = session.planned_exercises.find((pe: any) => pe.id === plannedId);
      if (!planned || planned.performed_sets.some((set: any) => set.set_number === payload.set_number)) {
        throw new Error("La serie ya está guardada o el ejercicio ha cambiado. Actualiza el plan.");
      }
      state.pending.push({ sessionId, plannedId, payload: { ...payload, set_number: payload.set_number, request_id: crypto.randomUUID() } });
      this.write(state);
      return this.view(sessionId);
    });
  }

  async sync(sessionId: number, request: Request, retry = false) {
    return this.lock(async () => {
      const state = this.read();
      for (const item of [...state.pending].filter(item => item.sessionId === sessionId)) {
        if (item.blocked && !retry) break;
        try {
          const session = await request("POST", `/sessions/${sessionId}/exercises/${item.plannedId}/sets`, item.payload);
          state.pending = state.pending.filter(candidate => candidate.payload.request_id !== item.payload.request_id);
          this.cacheSession(state, session);
          // Cache the confirmed result and remove its journal entry in one storage write.
          this.write(state);
        } catch (error: any) {
          // If persisting the acknowledgement failed, the original disk entry remains replayable.
          const preserved = this.read();
          const pending = preserved.pending.find(candidate => candidate.payload.request_id === item.payload.request_id);
          if (pending) {
            pending.error = error.message || "Sin conexión. La serie sigue pendiente.";
            pending.blocked = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
            this.write(preserved);
          }
          break;
        }
      }
    });
  }

  async discardRejected(requestId: string) {
    await this.lock(async () => {
      const state = this.read();
      const item = state.pending.find(item => item.payload.request_id === requestId);
      if (!item?.blocked) throw new Error("Solo se pueden descartar series rechazadas por el servidor.");
      state.pending = state.pending.filter(item => item.payload.request_id !== requestId);
      this.write(state);
    });
  }

  async guard<T>(sessionId: number, action: () => Promise<T>, removeSession = false): Promise<T> {
    return this.lock(async () => {
      if (this.read().pending.some(item => item.sessionId === sessionId)) {
        throw new Error("Hay series pendientes. Sincronízalas antes de finalizar o modificar la sesión.");
      }
      const result: any = await action();
      try {
        if (removeSession) {
          const state = this.read();
          delete state.sessions[sessionId];
          if (state.activeId === sessionId) delete state.activeId;
          this.write(state);
        } else if (result?.id === sessionId && Array.isArray(result.planned_exercises)) {
          const state = this.read();
          this.cacheSession(state, result);
          this.write(state);
        }
      } catch (error: any) {
        // The server committed; a cache failure must not report the mutation as failed.
        this.changed(error.message);
      }
      return result;
    });
  }
}

let browserJournal: SetJournal | undefined;
/** The signed Telegram data identifies a storage namespace; only the server authenticates it. */
export function getSetJournal(): SetJournal | undefined {
  if (typeof window === "undefined") return undefined;
  const initData = (window as any).Telegram?.WebApp?.initData;
  if (!initData) return undefined;
  const user = JSON.parse(new URLSearchParams(initData).get("user") || "null")?.id;
  if (!Number.isSafeInteger(user)) return undefined;
  if (browserJournal?.user !== String(user)) {
    browserJournal = new SetJournal(String(user), {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    }, async action => {
      if (!navigator.locks) throw new Error("Este navegador no permite guardar series de forma segura entre pestañas. Abre Telegram con un navegador actualizado.");
      return navigator.locks.request(`gym-set-journal:${user}`, action);
    }, (error) => window.dispatchEvent(new CustomEvent("gym-set-journal", { detail: { error } })));
  }
  return browserJournal;
}
