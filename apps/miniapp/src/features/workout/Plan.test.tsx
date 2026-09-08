import { h } from 'preact';
import render from 'preact-render-to-string';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

const context = vi.hoisted(() => ({ readOnly: false, pending: [] as any[] }));

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock('../../app/App', () => ({
  useApp: () => ({ readOnly: context.readOnly, workoutSync: { state: { pending: context.pending } }, pop: vi.fn(), replace: vi.fn() }),
  useSession: () => ({ data: null, isLoading: false }),
  useCurrent: () => ({ data: null }),
}));
vi.mock('../../lib/telegram', () => ({ haptic: () => undefined }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

import { CompletedSummary } from './Plan';
import * as planView from './Plan';

beforeEach(() => {
  context.readOnly = false;
  context.pending = [];
  vi.mocked(useMutation).mockClear();
  vi.mocked(apiFetch).mockClear();
});

describe('shared workout exercise actions', () => {
  const exercise = { planned_id: 4, name: 'Press', status: 'pending', performed_sets: [] };
  const renderActions = (overrides = {}) => render(h(planView.WorkoutExerciseActions, {
    sessionId: 1, planStatus: 'in_progress', exercise, ...overrides,
  }));

  it('offers the same three actions without order controls', () => {
    const html = renderActions();
    expect(html).toContain('Reemplazar');
    expect(html).toContain('Saltar');
    expect(html).toContain('Eliminar');
    expect(html).not.toContain('Subir');
    expect(html).not.toContain('Bajar');
  });

  it.each(['readonly', 'completed', 'journal'])('blocks mutations for %s', async (reason) => {
    context.readOnly = reason === 'readonly';
    context.pending = reason === 'journal' ? [{ sessionId: 1 }] : [];
    const html = renderActions({ planStatus: reason === 'completed' ? 'completed' : 'in_progress' });
    if (reason !== 'journal') expect(html).toBe('');
    else expect(html.split('</details>')[0].match(/<button\b[^>]*\sdisabled(?=[\s=>])/g)?.length).toBe(3);
    const mutation = vi.mocked(useMutation).mock.calls[0][0];
    await expect(mutation.mutationFn!({} as never, {} as never)).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('protects logged sets against replacement and deletion', () => {
    const html = renderActions({ exercise: { ...exercise, performed_sets: [{ set_number: 1 }] } });
    expect(html.split('</details>')[0].match(/<button\b[^>]*\sdisabled(?=[\s=>])/g)?.length).toBe(2);
  });

  it('skips through the existing API wrapper', async () => {
    renderActions();
    const mutation = vi.mocked(useMutation).mock.calls[0][0];
    await mutation.mutationFn!({} as never, {} as never);
    expect(apiFetch).toHaveBeenCalledWith('PUT', '/sessions/1/exercises/4', { status: 'skipped' });
  });
});

describe('visual exercise groups', () => {
  it('groups primary muscles without mutating order and keeps explicit mixed-muscle supersets intact', () => {
    const exercises = [
      { planned_id: 1, target: 'chest', muscle_group: 'arms' },
      { planned_id: 2, muscle_group: 'quadriceps' },
      { planned_id: 3, target: 'chest' },
      { planned_id: 4, target: 'biceps' },
      { planned_id: 5, target: 'triceps' },
    ];
    const original = structuredClone(exercises);
    const groups = planView.groupPlanExercises(exercises, [
      { id: 4, superset_group: 'A' }, { id: 5, superset_group: 'A' },
    ]);
    expect(groups.map(group => group.exercises.map(exercise => exercise.planned_id))).toEqual([[1, 3], [2], [4, 5]]);
    expect(groups.map(group => group.label)).toEqual(['Pecho', 'Cuádriceps', 'Superserie A']);
    expect(groups[2].exercises.every(exercise => exercise.superset_group === 'A')).toBe(true);
    expect(exercises).toEqual(original);
  });
});

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
