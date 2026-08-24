import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock('../../app/App', () => ({
  useApp: () => ({ readOnly: false, pop: vi.fn(), replace: vi.fn() }),
  useSession: () => ({ data: null, isLoading: false }),
  useCurrent: () => ({ data: null }),
}));
vi.mock('../../lib/telegram', () => ({ haptic: () => undefined }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

import { CompletedSummary } from './Plan';

describe('CompletedSummary component in Plan.tsx', () => {
  it('renders completed session stats and post-workout muscle load split', () => {
    const plan = {
      id: 901,
      title: 'Pierna · Base',
      status: 'completed',
      total_volume: 3660,
      duration_actual: 52,
      feedback: 'Gran congestión en cuádriceps.',
    };

    const exercises = [
      {
        planned_id: 1,
        name: 'Sentadilla con barra',
        target: 'quadriceps',
        secondary_muscles: 'gluteal, hamstring',
        performed_sets: [
          { set_number: 1, weight: 20, reps: 10, is_warmup: true }, // warmup excluded
          { set_number: 2, weight: 85, reps: 8, is_warmup: false },  // 680 kg
          { set_number: 3, weight: 85, reps: 8, is_warmup: false },  // 680 kg
        ],
      },
      {
        planned_id: 2,
        name: 'Peso muerto rumano',
        target: 'hamstring',
        secondary_muscles: 'gluteal',
        performed_sets: [
          { set_number: 1, weight: 90, reps: 8, is_warmup: false },  // 720 kg
          { set_number: 2, weight: 90, reps: 8, is_warmup: false },  // 720 kg
        ],
      },
    ];

    const html = render(h(CompletedSummary, { plan, exercises }));

    // Verify session header & feedback
    expect(html).toContain('data-testid="completed-summary"');
    expect(html).toContain('Sesión completada');
    expect(html).toContain('Series');
    expect(html).toContain('52 min');

    // Verify muscle load split section (Requirement R5)
    expect(html).toContain('data-testid="muscle-load-split"');
    expect(html).toContain('Distribución de carga muscular');
    expect(html).toContain('data-testid="split-progress-bar"');
    expect(html).toContain('data-testid="muscle-split-list"');

    // Verify anatomical muscle labels and proportions in Spanish
    expect(html).toContain('Cuádriceps');
    expect(html).toContain('Isquiotibiales');
    expect(html).toContain('Glúteos');
  });

  it('strictly excludes warm-up sets from muscle load split bars and counts', () => {
    const plan = {
      id: 902,
      title: 'Pecho',
      status: 'completed',
      total_volume: 1000,
      duration_actual: 30,
    };

    const exercises = [
      {
        planned_id: 1,
        name: 'Press banca',
        target: 'chest',
        secondary_muscles: '',
        performed_sets: [
          { set_number: 1, weight: 20, reps: 10, is_warmup: true },  // 200 kg warmup EXCLUDED
          { set_number: 2, weight: 100, reps: 10, is_warmup: false }, // 1000 kg working set
        ],
      },
    ];

    const html = render(h(CompletedSummary, { plan, exercises }));
    expect(html).toContain('Pecho');
    expect(html).toContain('100%');
    expect(html).toContain('1000 kg');
    expect(html).not.toContain('1200 kg');
  });
});
