import { useEffect, useState } from "preact/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { getSetJournal } from "../lib/set-journal";

export function useWorkoutSync(disabled: boolean) {
  const client = useQueryClient();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  let journal: ReturnType<typeof getSetJournal>;
  let state: ReturnType<NonNullable<typeof journal>["read"]> | undefined;
  try {
    journal = disabled ? undefined : getSetJournal();
    state = journal?.read();
  } catch (cause: any) { if (!error) setError(cause.message); }

  const sync = async (retry = false) => {
    if (!journal || !navigator.onLine) return;
    try {
      for (const id of new Set(journal.read().pending.map(item => item.sessionId))) {
        await journal.sync(id, async (...args) => {
          if (getSetJournal() !== journal) throw Object.assign(new Error("El usuario ha cambiado. Reabre la app."), {status: 401});
          return apiFetch(...args);
        }, retry);
      }
      for (const [id, session] of Object.entries(journal.read().sessions)) client.setQueryData(["session", +id], session);
      client.invalidateQueries({ queryKey: ["current"] });
      client.invalidateQueries({ queryKey: ["active"] });
      client.invalidateQueries({ queryKey: ["sessions"] });
      client.invalidateQueries({ queryKey: ["records"] });
      client.invalidateQueries({ queryKey: ["progress"] });
      setError("");
    } catch (cause: any) { setError(cause.message); }
  };

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const reconnect = () => { void sync(); };
    window.addEventListener("gym-set-journal", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    const interval = window.setInterval(reconnect, 30_000);
    reconnect();
    return () => {
      window.removeEventListener("gym-set-journal", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      window.clearInterval(interval);
    };
  }, [journal]);

  return { journal, state, error, revision, sync, setError };
}

export function PendingWrites({ sync }: { sync: ReturnType<typeof useWorkoutSync> }) {
  const pending = sync.state?.pending || [];
  if (!pending.length && !sync.error) return null;
  return <aside class="card" aria-live="polite">
    {sync.error && <p role="alert">{sync.error}</p>}
    {pending.length > 0 && <>
      <b>{pending.length} series pendientes de guardar en el servidor</b>
      <p>Conservadas en este dispositivo. Puedes continuar; sincroniza antes de finalizar.</p>
      {pending.map(item => <p key={item.payload.request_id}>
        Sesión {item.sessionId} · {sync.state?.sessions[item.sessionId]?.planned_exercises.find((pe: any) => pe.id === item.plannedId)?.exercise?.name || "Ejercicio"} · Serie {item.payload.set_number}: {item.payload.weight ? `${item.payload.weight} kg × ` : ""}{item.payload.reps ? `${item.payload.reps} reps/s` : `${item.payload.duration_minutes} min`}
        {item.error && <span role="alert"> · {item.error}</span>}
      </p>)}
      <button class="btn-primary mt-2" onClick={() => void sync.sync(true)}>Reintentar sincronización</button>
    </>}
  </aside>;
}
