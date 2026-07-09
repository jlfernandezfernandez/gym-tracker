/** Shared UI primitives: loading, empty state, topbar, bodymap and chart wrappers. */
import { useEffect, useRef } from 'preact/hooks';
import { renderBodyMap } from '../lib/bodymap';
import { renderProgressChart, type ProgressPoint } from '../lib/chart';

export function Loading({ msg = 'Cargando...' }: { msg?: string }) {
  return (
    <div class="loading">
      <div class="spinner" />
      <p>{msg}</p>
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
  class: cls = 'btn',
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
    <button class={cls} disabled={busy} onClick={onClick}>
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderBodyMap(ref.current, muscles);
  }, [muscles.join(',')]);
  return <div ref={ref} />;
}

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = renderProgressChart(ref.current, points);
    return () => chart.destroy();
  }, [points]);
  return (
    <div class="chart-wrap">
      <canvas ref={ref} />
    </div>
  );
}
