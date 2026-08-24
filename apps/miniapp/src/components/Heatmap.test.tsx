import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Heatmap } from './Heatmap';

describe('Heatmap component', () => {
  const fixedToday = new Date('2026-08-24T12:00:00'); // Monday

  it('renders heatmap container, weekday labels and month headers', () => {
    const html = render(
      h(Heatmap, {
        sessions: [],
        today: fixedToday,
      }),
    );

    expect(html).toContain('data-testid="activity-heatmap"');
    expect(html).toContain('Actividad y consistencia');
    expect(html).toContain('L');
    expect(html).toContain('X');
    expect(html).toContain('V');
    expect(html).toContain('Ago');
    expect(html).toContain('Menos');
    expect(html).toContain('Más');
  });

  it('displays streak counter badge with weekly calculation', () => {
    const mockSessions = [
      { session_date: '2026-08-24', duration_actual: 45 },
      { session_date: '2026-08-18', duration_actual: 50 },
      { session_date: '2026-08-11', duration_actual: 60 },
      { session_date: '2026-08-04', duration_actual: 40 },
    ];

    const html = render(
      h(Heatmap, {
        sessions: mockSessions,
        today: fixedToday,
      }),
    );

    expect(html).toContain('data-testid="streak-badge"');
    expect(html).toContain('4 semanas');
    expect(html).toContain('4 entrenamientos');
  });

  it('applies intensity tiers based on quantile thresholds', () => {
    const mockSessions = [
      { session_date: '2026-08-24', duration_actual: 90, total_volume: 5000 }, // High
      { session_date: '2026-08-20', duration_actual: 60, total_volume: 3000 }, // Med
      { session_date: '2026-08-15', duration_actual: 30, total_volume: 1500 }, // Low
    ];

    const html = render(
      h(Heatmap, {
        sessions: mockSessions,
        today: fixedToday,
      }),
    );

    expect(html).toContain('data-date="2026-08-24"');
    expect(html).toContain('data-workouts="1"');
    expect(html).toContain('data-tier="4"');
  });

  it('highlights today cell with active ring', () => {
    const html = render(
      h(Heatmap, {
        sessions: [],
        today: fixedToday,
      }),
    );

    expect(html).toContain('ring-1.5 ring-accent');
    expect(html).toContain('data-date="2026-08-24"');
  });
});
