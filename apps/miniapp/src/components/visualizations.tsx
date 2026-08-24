import { useEffect, useRef } from 'preact/hooks';
import { renderProgressChart, renderMeasurementChart, type ProgressPoint, type MeasurementPoint } from '../lib/chart';
export { BodyMap, type BodyMapProps } from './BodyMap';
export { Heatmap, type HeatmapProps } from './Heatmap';
export type { BodyMapMode, MuscleRecoveryInfo } from '../lib/bodymap';

export function ProgressChart({ points }: { points: ProgressPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = renderProgressChart(canvasRef.current, points);
    return () => chart.destroy();
  }, [points]);
  return <div class="relative mt-2.5 h-[165px]"><canvas ref={canvasRef} /></div>;
}

/** Series progress bar: completed (ok-bright), current (accent), pending (track-dim). */
export function SetProgress({ total, completedSetNumbers, currentSetNumber, showCurrent, class: cssClass = '', ariaLabel }: {
  total: number;
  completedSetNumbers: Set<number>;
  currentSetNumber?: number;
  showCurrent?: boolean;
  class?: string;
  ariaLabel: string;
}) {
  return (
    <div class={`${cssClass} flex gap-[5px] [&>span]:h-[5px] [&>span]:flex-1 [&>span]:rounded-[9px] [&>span]:bg-track-dim`} aria-label={ariaLabel}>
      {Array.from({ length: total }, (_, setIndex) => (
        <span key={setIndex} class={completedSetNumbers.has(setIndex + 1) ? '!bg-ok-bright' : showCurrent && currentSetNumber === setIndex + 1 ? '!bg-accent' : ''} />
      ))}
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
  return <div class="relative mt-2.5 h-[165px]"><canvas ref={canvasRef} /></div>;
}
