/** Plan: session overview, exercise list, share and finish. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { STATUS_ES, cleanTitle, completedSets, currentExercise, mediaUrl, sessionMuscles, toast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp, useCurrent, useSession } from '../App';
import { BodyMap, BusyButton, Empty, Loading, TopBar } from '../ui';

export function Plan() {
  const app = useApp();
  const session = useSession();
  const p = session.data;
  const current = useCurrent(p?.id);

  if (session.isLoading) return <Loading msg="Cargando plan..." />;
  if (session.isError || !p)
    return (
      <>
        {!app.readOnly && <TopBar title="Plan" onBack={app.pop} />}
        <Empty icon="🔗">No pude cargar este plan.</Empty>
      </>
    );

  const exs = p.exercises || [];
  const doneSets = exs.reduce((a: number, e: any) => a + completedSets(e), 0);
  const totalSets = exs.reduce((a: number, e: any) => a + (e.sets || 0), 0);
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const muscles = sessionMuscles(exs);
  const heroMedia = mediaUrl(exs.find((e: any) => e.gif_url || e.image_url)?.gif_url || exs.find((e: any) => e.image_url)?.image_url);
  const curId = current.data?.current_planned_exercise_id;
  const openExercise = (plannedId: number) => app.push({ name: 'exercise', plannedId });

  return (
    <>
      <TopBar
        title={cleanTitle(p.title) || 'Plan del coach'}
        subtitle={app.readOnly ? 'Plan compartido contigo' : 'Creado por el coach. Aquí se ejecuta y registra.'}
        onBack={app.readOnly ? undefined : app.pop}
      />
      <div class="session-hero card">
        {heroMedia && (
          <div class="session-hero-media">
            <img src={heroMedia} loading="eager" />
          </div>
        )}
        <div class="session-hero-content">
          <div class="meta">
            <span class="pill active">{STATUS_ES[p.status] || p.status}</span>
            <span class="pill">{p.duration_estimated || 0} min</span>
          </div>
          <h1>{cleanTitle(p.title)}</h1>
          <p>{p.goal || p.coach_summary || 'Plan generado por el coach'}</p>
          <div class="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div class="grid stats mt-2.5">
            <div class="stat">
              <b>{exs.length}</b>
              <span>ejercicios</span>
            </div>
            <div class="stat">
              <b>
                {doneSets}/{totalSets}
              </b>
              <span>series</span>
            </div>
            <div class="stat">
              <b>{pct}%</b>
              <span>progreso</span>
            </div>
          </div>
        </div>
      </div>

      {muscles.length > 0 && (
        <div class="card">
          <h2>Mapa muscular de hoy</h2>
          <BodyMap muscles={muscles} />
          <div class="meta muscle-cloud">
            {muscles.slice(0, 10).map((m) => (
              <span class="pill" key={m}>
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {exs.map((ex: any) => {
        const isCur = String(ex.planned_id) === String(curId);
        const media = mediaUrl(ex.gif_url || ex.image_url);
        const epct = ex.sets ? Math.min(100, Math.round((completedSets(ex) / ex.sets) * 100)) : 0;
        return (
          <div class={`card tap exercise-card ${isCur ? 'current' : ''}`} key={ex.planned_id} onClick={() => openExercise(ex.planned_id)}>
            <div class="exercise-media">{media ? <img src={media} loading="lazy" /> : '🏋️'}</div>
            <div class="exercise-card-body">
              <div class="exercise-title-row">
                <h3>{ex.name || 'Ejercicio'}</h3>
                <span class="pill">
                  {completedSets(ex)}/{ex.sets}
                </span>
              </div>
              <p>
                {ex.target || ex.muscle_group || ''}
                {ex.equipment ? ` · ${ex.equipment}` : ''}
              </p>
              <div class="progress mini">
                <div style={{ width: `${epct}%` }} />
              </div>
              <div class="meta">
                <span class="pill active">
                  {ex.sets}×{ex.reps}
                </span>
                <span class="pill">{ex.weight ? `${ex.weight}kg` : 'peso corporal'}</span>
                <span class={`pill st-${ex.status}`}>{STATUS_ES[ex.status] || ex.status}</span>
                {isCur && <span class="pill active">actual</span>}
              </div>
            </div>
          </div>
        );
      })}

      {p.status === 'completed' && <CompletedSummary p={p} exs={exs} />}

      {!app.readOnly && p.status !== 'completed' && (
        <div class="row mt-3">
          <button class="btn" onClick={() => openExercise(currentExercise(p, current.data)?.planned_id)}>
            ▶ Ejercicio actual
          </button>
          <FinishButton sessionId={p.id} energy={p.energy} discomfort={p.discomfort} />
        </div>
      )}
      {!app.readOnly && p.share_token && <ShareButton title={cleanTitle(p.title)} token={p.share_token} />}
    </>
  );
}

function CompletedSummary({ p, exs }: { p: any; exs: any[] }) {
  const vol = exs.reduce((a, e) => a + (e.performed_sets || []).reduce((x: number, ps: any) => x + ps.weight * ps.reps, 0), 0);
  const tsets = exs.reduce((a, e) => a + (e.performed_sets || []).length, 0);
  return (
    <div class="card">
      <h2>Sesión completada</h2>
      {p.feedback && <p>{p.feedback}</p>}
      <div class="grid stats mt-2.5">
        <div class="stat">
          <b>{tsets}</b>
          <span>series</span>
        </div>
        <div class="stat">
          <b>{Math.round(vol)}</b>
          <span>kg volumen</span>
        </div>
        <div class="stat">
          <b>{p.duration_actual || p.duration_estimated || 0}min</b>
          <span>duración</span>
        </div>
      </div>
    </div>
  );
}

function ShareButton({ title, token }: { title: string; token: string }) {
  const share = async () => {
    const url = `${location.origin}/session/share/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      haptic('ok');
      toast('Enlace copiado — pásaselo a tu compañero', 'ok');
    } catch {
      // Clipboard can be blocked (Telegram webview) — fall back to the native share sheet.
      if (navigator.share) navigator.share({ title, url }).catch(() => {});
      else prompt('Copia el enlace:', url);
    }
  };
  return (
    <button class="btn ghost mt-2.5" onClick={share}>
      🔗 Compartir con un compañero
    </button>
  );
}

function FinishButton({ sessionId, energy, discomfort }: { sessionId: number; energy: number; discomfort: string }) {
  const app = useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const fb = useRef<HTMLTextAreaElement>(null);
  // Native <dialog>: prompt() is unreliable inside the Telegram webview.
  useEffect(() => {
    open ? dlg.current?.showModal() : dlg.current?.close();
  }, [open]);

  const finish = useMutation({
    mutationFn: () =>
      apiFetch('POST', `/sessions/${sessionId}/finish`, {
        feedback: fb.current?.value || '',
        energy: energy || 5,
        discomfort: discomfort || '',
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['session', sessionId], updated);
      qc.invalidateQueries({ queryKey: ['active'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['records'] });
      setOpen(false);
      haptic('ok');
      toast('Sesión finalizada', 'ok');
    },
    onError: (e: any) => {
      haptic('bad');
      toast(e.message, 'err');
    },
  });

  return (
    <>
      <button class="btn secondary" onClick={() => setOpen(true)}>
        ✓ Finalizar
      </button>
      <dialog ref={dlg} class="sheet" onClose={() => setOpen(false)}>
        <h2>Finalizar sesión</h2>
        <p>Cuéntale al coach cómo ha ido (opcional).</p>
        <textarea ref={fb} placeholder="Fácil, duro, molestias, sensaciones..." />
        <div class="row mt-3">
          <button class="btn ghost" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <BusyButton busy={finish.isPending} busyLabel="Finalizando..." onClick={() => finish.mutate()}>
            ✓ Finalizar
          </BusyButton>
        </div>
      </dialog>
    </>
  );
}
