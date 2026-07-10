/** Shared UI primitives: loading, empty state, topbar, confirm sheet, bodymap and chart wrappers. */
import { useEffect, useRef } from 'preact/hooks';
import { renderBodyMap } from '../lib/bodymap';
import { renderProgressChart, type ProgressPoint } from '../lib/chart';

export function Loading({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div class="loading">
      <div class="spinner" />
      <p>{message}</p>
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: any }) {
  return (
    <div class="empty">
      <div class="icon">{icon}</div>
      <p>{children}</p>
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: any;
}) {
  return (
    <div class="topbar">
      {onBack && (
        <button class="back" aria-label="Volver" onClick={onBack}>
          ←
        </button>
      )}
      <div class="min-w-0 flex-1">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function BusyButton({
  busy,
  busyLabel,
  class: cssClass = 'btn',
  onClick,
  children,
}: {
  busy: boolean;
  busyLabel: string;
  class?: string;
  onClick: () => void;
  children: any;
}) {
  return (
    <button class={cssClass} disabled={busy} onClick={onClick}>
      {busy ? (
        <>
          <span class="btn-spinner" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Native <dialog> confirmation — window.confirm() is unreliable in the Telegram webview. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    open ? dialogRef.current?.showModal() : dialogRef.current?.close();
  }, [open]);
  return (
    <dialog ref={dialogRef} class="sheet" onClose={onCancel}>
      <h2>{title}</h2>
      <p>{message}</p>
      <div class="row mt-3">
        <button class="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
        <BusyButton busy={busy} busyLabel="..." onClick={onConfirm}>
          {confirmLabel}
        </BusyButton>
      </div>
    </dialog>
  );
}

export function BodyMap({ muscles }: { muscles: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) renderBodyMap(containerRef.current, muscles);
  }, [muscles.join(',')]);
  return <div ref={containerRef} />;
}

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = renderProgressChart(canvasRef.current, points);
    return () => chart.destroy();
  }, [points]);
  return (
    <div class="chart-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
