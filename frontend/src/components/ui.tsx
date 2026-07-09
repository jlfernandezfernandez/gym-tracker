/** Shared UI primitives: loading, empty state, topbar, bodymap and chart wrappers. */
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

export function TopBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
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
  // Synchronous double-click guard: `busy` (React state) only updates on the
  // next render, so two clicks in the same tick would both fire without it.
  const lastClickAtRef = useRef(0);
  const handleClick = () => {
    const now = Date.now();
    if (busy || now - lastClickAtRef.current < 350) return;
    lastClickAtRef.current = now;
    onClick();
  };

  return (
    <button class={cssClass} disabled={busy} onClick={handleClick}>
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
