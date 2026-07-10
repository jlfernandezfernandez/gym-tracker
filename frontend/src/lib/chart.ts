/**
 * Progression chart (top weight per session) with Chart.js.
 */
import Chart from 'chart.js/auto';

export interface ProgressPoint {
  date: string;
  top_weight: number;
  top_reps?: number;
  volume: number;
  sets: number;
}

export interface MeasurementPoint {
  date: string;
  value: number;
}

const COLORS = {
  accent: () => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#5856d6',
  hint: () => getComputedStyle(document.documentElement).getPropertyValue('--color-hint').trim() || '#6b7280',
  ok: () => getComputedStyle(document.documentElement).getPropertyValue('--color-ok').trim() || '#248a3d',
};

const GRID_COLOR = 'rgba(17,24,39,.08)';

/** Bodyweight exercises have no logged weight; the chart (and its labels) fall back to reps. */
export const chartUsesWeight = (points: ProgressPoint[]) => points.some((point) => point.top_weight > 0);

export function renderProgressChart(canvas: HTMLCanvasElement, points: ProgressPoint[]): Chart {
  const accentColor = COLORS.accent();
  const hintColor = COLORS.hint();
  const usesWeight = chartUsesWeight(points);
  const values = points.map((point) => (usesWeight ? point.top_weight : point.top_reps || 0));

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
              return usesWeight
                ? [`máx ${point.top_weight} kg`, `${point.sets} series · ${Math.round(point.volume)} kg vol`]
                : [`máx ${point.top_reps || 0} reps`, `${point.sets} series`];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: hintColor, font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: {
          ticks: { color: hintColor, font: { size: 10 }, callback: (value) => (usesWeight ? `${value}kg` : `${value} reps`) },
          grid: { color: GRID_COLOR },
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
        y: { ticks: { color: hintColor, font: { size: 10 }, callback: (v) => `${v}${unit}` }, grid: { color: GRID_COLOR } },
      },
    },
  });
}
