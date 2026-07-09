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

export function renderProgressChart(canvas: HTMLCanvasElement, pts: ProgressPoint[]): void {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--btn').trim() || '#4f46e5';
  const hint = css.getPropertyValue('--hint').trim() || '#6b7280';
  const border = 'rgba(17,24,39,.08)';

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: pts.map((p) => p.date.slice(5)),
      datasets: [
        {
          data: pts.map((p) => p.top_weight),
          borderColor: accent,
          backgroundColor: 'rgba(79,70,229,.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: accent,
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
            label: (ctx) => {
              const p = pts[ctx.dataIndex];
              return [`máx ${p.top_weight} kg`, `${p.sets} series · ${Math.round(p.volume)} kg vol`];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: hint, font: { size: 10 }, maxTicksLimit: 6 }, grid: { display: false } },
        y: {
          ticks: { color: hint, font: { size: 10 }, callback: (v) => `${v}kg` },
          grid: { color: border },
        },
      },
    },
  });
}
