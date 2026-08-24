import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('../lib/telegram', () => ({
  haptic: () => undefined,
  tg: undefined,
  inTelegram: () => false,
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock('../app/App', () => ({
  useApp: () => ({ readOnly: false, pop: vi.fn(), replace: vi.fn() }),
  useSession: () => ({ data: null, isLoading: false }),
}));
vi.mock('../lib/wakelock', () => ({
  useWakeLock: vi.fn(),
}));

import { BodyMap } from './BodyMap';
import { Heatmap } from './Heatmap';
import { IsometricTimer } from '../features/workout/Exercise';

describe('Adversarial UI Test: BodyMap Component Edge Cases', () => {
  it('renders without crashing when all props are empty / null', () => {
    const html = render(
      h(BodyMap, {
        recoveryData: null,
        volumeData: null,
        recordsData: null,
        muscles: undefined,
        selectedMuscle: null,
      }),
    );

    expect(html).toContain('Vista frontal');
    expect(html).toContain('Vista dorsal');
  });

  it('renders all 3 modes cleanly with popovers', () => {
    // Mode 1: Fatigue with extreme values
    const fatigueHtml = render(
      h(BodyMap, {
        mode: 'fatigue',
        recoveryData: {
          quadriceps: { muscle: 'quadriceps', readiness_pct: 0, fatigue_pct: 100, status: 'fatigued' },
          chest: { muscle: 'chest', readiness_pct: 50, fatigue_pct: 50, status: 'recovering' },
          biceps: { muscle: 'biceps', readiness_pct: 100, fatigue_pct: 0, status: 'ready' },
        },
        selectedMuscle: 'quadriceps',
        showPopover: true,
        showLegend: true,
      }),
    );
    expect(fatigueHtml).toContain('Cuádriceps');
    expect(fatigueHtml).toContain('Fatigado');
    expect(fatigueHtml).toContain('(0%)');
    expect(fatigueHtml).toContain('Listo (≥75%)');

    // Mode 2: Balance with 0 sets and 12 sets
    const balanceHtml = render(
      h(BodyMap, {
        mode: 'balance',
        volumeData: {
          chest: 12,
          abs: 0,
        },
        selectedMuscle: 'chest',
        showPopover: true,
        showLegend: true,
      }),
    );
    expect(balanceHtml).toContain('Pecho');
    expect(balanceHtml).toContain('12 series');
    expect(balanceHtml).toContain('Mayor volumen');
  });

  it('correctly handles active outline highlights and stroke styles', () => {
    const html = render(
      h(BodyMap, {
        selectedMuscle: 'gluteal',
      }),
    );

    // Selected muscle polygon should have active ink stroke and data-selected="true"
    expect(html).toContain('data-muscle="gluteal" data-selected="true"');
    expect(html).toContain('stroke="var(--color-ink, #ffffff)"');
    expect(html).toContain('stroke-width="2.5"');
  });
});

describe('Adversarial UI Test: Heatmap Edge Renders', () => {
  const fixedToday = new Date('2026-08-24T12:00:00');

  it('renders 52 weeks without crashing on empty history', () => {
    const html = render(
      h(Heatmap, {
        sessions: [],
        weeksCount: 52,
        today: fixedToday,
      }),
    );

    expect(html).toContain('0 entrenamientos · 0 semanas activas');
    expect(html).toContain('0 semanas');
  });

  it('renders properly on light and dark theme classes', () => {
    const html = render(
      h(Heatmap, {
        sessions: [{ session_date: '2026-08-24', duration_actual: 45 }],
        today: fixedToday,
      }),
    );

    // Verifies theme-adaptive classes
    expect(html).toContain('bg-surface-2');
    expect(html).toContain('bg-accent');
    expect(html).toContain('border-edge');
  });
});

describe('Adversarial UI Test: Isometric Timer Controls', () => {
  it('renders isometric timer with all interactive touch targets', () => {
    const onFinish = vi.fn();
    const onStopEarly = vi.fn();
    const onAdjustTime = vi.fn();

    const html = render(
      h(IsometricTimer, {
        targetSeconds: 60,
        onFinish,
        onStopEarly,
        onAdjustTime,
      }),
    );

    expect(html).toContain('01:00');
    expect(html).toContain('Objetivo: 60s');
    expect(html).toContain('▶ Iniciar');
    expect(html).toContain('+10s');
    expect(html).toContain('+30s');
  });
});
