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

/** Bodyweight exercises have no logged weight; the chart (and its labels) fall back to reps. */
export const chartUsesWeight = (points: ProgressPoint[]) => points.some((point) => point.top_weight > 0);

export function renderProgressChart(canvas: HTMLCanvasElement, points: ProgressPoint[]): Chart {
  const rootStyles = getComputedStyle(document.documentElement);
  const accentColor = rootStyles.getPropertyValue('--accent').trim() || '#5856d6';
  const hintColor = rootStyles.getPropertyValue('--hint').trim() || '#6b7280';
  const gridColor = 'rgba(17,24,39,.08)';
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
          grid: { color: gridColor },
        },
      },
    },
  });
}
