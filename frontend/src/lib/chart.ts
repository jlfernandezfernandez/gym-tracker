/**
 * Progression chart (top weight per session) with Chart.js.
 */
import Chart from 'chart.js/auto';

export interface ProgressPoint {
  date: string;
  top_weight: number;
  volume: number;
  sets: number;
}

export function renderProgressChart(canvas: HTMLCanvasElement, points: ProgressPoint[]): Chart {
  const rootStyles = getComputedStyle(document.documentElement);
  const accentColor = rootStyles.getPropertyValue('--btn').trim() || '#4f46e5';
  const hintColor = rootStyles.getPropertyValue('--hint').trim() || '#6b7280';
  const gridColor = 'rgba(17,24,39,.08)';

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((point) => point.date.slice(5)),
      datasets: [
        {
          data: points.map((point) => point.top_weight),
          borderColor: accentColor,
          backgroundColor: 'rgba(79,70,229,.08)',
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
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (tooltipContext) => {
              const point = points[tooltipContext.dataIndex];
              return [`máx ${point.top_weight} kg`, `${point.sets} series · ${Math.round(point.volume)} kg vol`];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: hintColor, font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: {
          ticks: { color: hintColor, font: { size: 10 }, callback: (value) => `${value}kg` },
          grid: { color: gridColor },
        },
      },
    },
  });
}
