/**
 * Progression chart (top weight per session) with Chart.js.
 */
import { CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';

// Only line charts are used; registering just their pieces keeps the rest of chart.js out of the bundle.
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

export interface ProgressPoint {
  date: string;
  top_weight: number | null;
  activity_type: 'strength' | 'cardio';
  execution_metric?: 'reps' | 'duration_minutes' | 'duration_seconds';
  weight_mode: 'bodyweight' | 'unloaded' | 'weighted' | null;
  top_reps?: number;
  top_duration_minutes?: number;
  top_duration_seconds?: number;
  volume: number;
  sets: number;
}

export interface MeasurementPoint {
  date: string;
  value: number;
}

function resolvedColor(token: string, fallback: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(--color-${token}, ${fallback})`;
  document.documentElement.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

const COLORS = {
  accent: () => resolvedColor('accent', '#5856d6'),
  hint: () => resolvedColor('hint', '#6b7280'),
  grid: () => resolvedColor('edge', 'rgba(17,24,39,.08)'),
};

export const progressValue = (point: ProgressPoint, metric: 'minutes' | 'seconds' | 'weight' | 'reps') =>
  metric === 'minutes'
    ? point.top_duration_minutes || 0
    : metric === 'seconds'
      ? point.top_duration_seconds || 0
      : metric === 'weight'
        ? point.top_weight || 0
        : point.top_reps || 0;

export const progressUnit = (metric: 'minutes' | 'seconds' | 'weight' | 'reps') =>
  metric === 'minutes' ? 'min' : metric === 'seconds' ? 's' : metric === 'weight' ? 'kg' : 'reps';

/** Bodyweight exercises have no logged weight; the chart (and its labels) fall back to reps. */
export const chartUsesWeight = (points: ProgressPoint[]) => points.some((point) => point.weight_mode === 'weighted');
export const progressMetric = (points: ProgressPoint[]) =>
  points.some((point) => point.execution_metric === 'duration_minutes' || point.activity_type === 'cardio')
    ? 'minutes'
    : points.some((point) => point.execution_metric === 'duration_seconds' || (point.top_duration_seconds || 0) > 0)
      ? 'seconds'
    : chartUsesWeight(points)
      ? 'weight'
      : 'reps';

export function renderProgressChart(canvas: HTMLCanvasElement, points: ProgressPoint[]): Chart {
  const accentColor = COLORS.accent();
  const hintColor = COLORS.hint();
  const metric = progressMetric(points);
  const values = points.map((point) => progressValue(point, metric));

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((point) => point.date.slice(5)),
      datasets: [
        {
          data: values,
          borderColor: accentColor,
          backgroundColor: 'rgba(88,86,214,.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: accentColor,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (tooltipContext) => {
              const point = points[tooltipContext.dataIndex];
              return metric === 'minutes'
                ? [`máx ${point.top_duration_minutes || 0} min`, `${point.sets} bloques`]
                : metric === 'seconds'
                ? [`máx ${point.top_duration_seconds || 0} s`, `${point.sets} series`]
                : metric === 'weight'
                ? [`máx ${point.top_weight || 0} kg`, `${point.sets} series · ${Math.round(point.volume)} kg vol`]
                : [`máx ${point.top_reps || 0} reps`, `${point.sets} series`];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: hintColor, font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: {
          ticks: { color: hintColor, font: { size: 10 }, callback: (value) => metric === 'minutes' ? `${value} min` : metric === 'seconds' ? `${value}s` : metric === 'weight' ? `${value}kg` : `${value} reps` },
          grid: { color: COLORS.grid() },
        },
      },
    },
  });
}

export function renderMeasurementChart(canvas: HTMLCanvasElement, points: MeasurementPoint[], unit: string): Chart {
  const accentColor = COLORS.accent();
  const hintColor = COLORS.hint();
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((p) => p.date.slice(5)),
      datasets: [
        {
          data: points.map((p) => p.value),
          borderColor: accentColor,
          backgroundColor: 'rgba(88,86,214,.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: accentColor,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
      scales: {
        x: { ticks: { color: hintColor, font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: hintColor, font: { size: 10 }, callback: (v) => `${v}${unit}` }, grid: { color: COLORS.grid() } },
      },
    },
  });
}
