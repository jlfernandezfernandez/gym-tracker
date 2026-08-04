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
  useApp: () => ({ readOnly: false }),
}));
vi.mock('../../lib/telegram', () => ({ haptic: () => undefined }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

import { LogSetForm } from './Exercise';

function renderForm(exercise: Record<string, unknown>) {
  return render(
    h(LogSetForm, {
      sessionId: 1,
      exercise: {
        planned_id: 2,
        exercise_id: 3,
        performed_sets: [],
        set_targets: [],
        weight_mode: 'weighted',
        ...exercise,
      },
      nextSetNumber: 1,
      remainingSetCount: 1,
      onShowPicker: () => undefined,
    }),
  );
}

describe('LogSetForm exercise metrics', () => {
  it('shows only minutes for cardio', () => {
    const html = renderForm({
      activity_type: 'cardio',
      duration_minutes: 20,
      reps: null,
      weight: null,
      weight_mode: null,
    });

    expect(html).toContain('Minutos');
    expect(html).not.toContain('Peso (kg)');
    expect(html).not.toContain('>Reps<');
    expect(html).toContain('20 min');
  });

  it('keeps weight and reps for strength', () => {
    const html = renderForm({
      activity_type: 'strength',
      reps: 10,
      weight: 40,
    });

    expect(html).toContain('Peso (kg)');
    expect(html).toContain('>Reps<');
    expect(html).not.toContain('Minutos');
  });
});
