/** Shared UI primitives: loading, empty state, topbar, confirm sheet, bodymap and chart wrappers. */
import { useEffect, useRef } from 'preact/hooks';
import { renderBodyMap } from '../lib/bodymap';
import { renderProgressChart, renderMeasurementChart, type ProgressPoint, type MeasurementPoint } from '../lib/chart';

export function Loading({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div class="grid min-h-[260px] place-content-center justify-items-center gap-3">
      <div class="size-6 animate-[spin_.7s_linear_infinite] rounded-full border-2 border-edge border-t-accent will-change-transform" />
      <p>{message}</p>
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: any }) {
  return (
    <div class="px-4 py-11 text-center">
      <div class="mb-2.5 text-2xl opacity-45">{icon}</div>
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
    <div class="sticky top-0 z-5 mb-2 flex min-h-12 items-center gap-[9px] bg-[color-mix(in_srgb,var(--color-canvas)_84%,transparent)] py-[5px] backdrop-blur-[18px] backdrop-saturate-150 motion-reduce:backdrop-filter-none motion-reduce:bg-surface">
      {onBack && (
        <button class="min-h-11 min-w-11 cursor-pointer rounded-pill border-0 bg-surface text-xl text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_rgba(0,0,0,.04)] active:scale-95" aria-label="Volver" onClick={onBack}>
          ←
        </button>
      )}
      <div class="min-w-0 flex-1">
        <h2 class="text-center">{title}</h2>
        {subtitle && <p class="text-center text-[.7rem]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function BusyButton({
  busy,
  busyLabel,
  class: cssClass = 'min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-white transition active:scale-[.975] active:opacity-[.82] disabled:pointer-events-none disabled:opacity-35',
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
          <span class="mr-[7px] inline-block size-[13px] animate-[spin_.6s_linear_infinite] rounded-full border-2 border-white/40 border-t-white align-[-2px] will-change-transform" />
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
    <dialog ref={dialogRef} class="m-auto mb-2.5 w-[min(100%-20px,430px)] rounded-[24px] border-0 bg-[rgba(250,250,252,.94)] p-5 text-ink shadow-sheet backdrop-blur-3xl backdrop-saturate-150 backdrop:bg-surface min-[720px]:m-auto [&::backdrop]:bg-black/30" onClose={onCancel}>
      <h2>{title}</h2>
      <p>{message}</p>
      <div class="mt-3 flex items-center gap-[9px] [&>button]:min-w-0 [&>button]:flex-1">
        <button class="min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-transparent px-[17px] py-[13px] text-[.94rem] font-[720] text-accent transition hover:bg-accent-bg active:scale-[.975] active:opacity-[.82]" onClick={onCancel}>
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
    <div class="relative mt-2.5 h-[165px]">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function MeasurementChart({ points, unit }: { points: MeasurementPoint[]; unit: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = renderMeasurementChart(canvasRef.current, points, unit);
    return () => chart.destroy();
  }, [points, unit]);
  return (
    <div class="relative mt-2.5 h-[165px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
