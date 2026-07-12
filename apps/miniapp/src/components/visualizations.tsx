import { useEffect, useRef } from 'preact/hooks';
import { renderBodyMap } from '../lib/bodymap';
import { renderProgressChart, renderMeasurementChart, type ProgressPoint, type MeasurementPoint } from '../lib/chart';

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
  return <div class="relative mt-2.5 h-[165px]"><canvas ref={canvasRef} /></div>;
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
