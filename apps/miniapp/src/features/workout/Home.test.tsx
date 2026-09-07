import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it, vi } from 'vitest';

const setQueryData = vi.fn();
const openSession = vi.fn();
const push = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'profile') {
      return { data: { name: 'Jordi' }, isLoading: false };
    }
    if (key === 'active') {
      return {
        isLoading: false,
        data: {
          session: {
            id: 11,
            title: 'Grip',
            planned_exercises: [
              {
                id: 7,
                order: 0,
                exercise_id: 30,
                target_sets: 3,
                target_reps: null,
                target_duration_seconds: 40,
                suggested_weight: 32.5,
                execution_metric: 'duration_seconds',
                status: 'in_progress',
                performed_sets: [
                  { set_number: 1, duration_seconds: 50, weight: 32.5 },
                  { set_number: 3, duration_seconds: 45, weight: 35 },
                ],
                set_targets: [{ set_number: 2, duration_seconds: 55, weight: 34 }],
                exercise: { name: 'Farmer Carry', activity_type: 'strength' },
              },
            ],
          },
          current: {
            current_planned_exercise_id: 7,
            current_set_number: 2,
            current_exercise_name: 'Farmer Carry',
            next_set_target: { set_number: 2, duration_seconds: 55, weight: 36 },
            completed_sets: 2,
            total_sets: 3,
          },
        },
      };
    }
    return { data: [], isLoading: false };
  },
  useQueryClient: () => ({ setQueryData }),
}));

vi.mock('../../app/App', () => ({
  useApp: () => ({ openSession, push }),
}));

vi.mock('../../lib/telegram', () => ({ haptic: () => undefined }));

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

vi.mock('../../components/feedback', () => ({
  Empty: ({ children }: any) => h('div', null, children),
  Stat: ({ label, value }: any) => h('div', null, `${label}:${value}`),
}));

vi.mock('../../components/visualizations', () => ({
  Heatmap: () => null,
  SetProgress: ({ ariaLabel }: { ariaLabel: string }) => h('div', { 'data-aria': ariaLabel }, ariaLabel),
}));

import { Home } from './Home';

describe('Home', () => {
  it('shows the real current set and seconds target for timed strength', () => {
    const html = render(h(Home, {}));

    expect(html).toContain('Serie 2 de 3');
    expect(html).toContain('Segundos:55');
    expect(html).not.toContain('Reps:');
  });
});