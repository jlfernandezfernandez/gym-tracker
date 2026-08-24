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
}));
vi.mock('../../lib/telegram', () => ({ haptic: () => undefined }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));

import {
  formatTimerDisplay,
  isTimedOrIsometricExercise,
  IsometricTimer,
  LogSetForm,
  SetRow,
  targetValue,
} from './Exercise';

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

describe('isTimedOrIsometricExercise', () => {
  it('detects explicit timed and isometric activity types', () => {
    expect(isTimedOrIsometricExercise({ activity_type: 'timed' })).toBe(true);
    expect(isTimedOrIsometricExercise({ activity_type: 'isometric' })).toBe(true);
    expect(isTimedOrIsometricExercise({ is_isometric: true })).toBe(true);
    expect(isTimedOrIsometricExercise({ is_timed: true })).toBe(true);
    expect(isTimedOrIsometricExercise({ mode: 'time' })).toBe(true);
  });

  it('detects isometric exercise names in Spanish and English', () => {
    expect(isTimedOrIsometricExercise({ name: 'Plancha abdominal' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name_en: 'Plank hold' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Dead Hang' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Paseo del granjero (Farmer carry)' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Wall sit' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Sentadilla isométrica' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Hollow body hold' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'L-sit hold' })).toBe(true);
  });

  it('detects isometric hold instructions and notes', () => {
    expect(isTimedOrIsometricExercise({ name: 'Colgado en barra', notes: 'Aguantar 45s en isometría' })).toBe(true);
    expect(isTimedOrIsometricExercise({ name: 'Puente de glúteo', instructions: 'Hold for 30 seconds' })).toBe(true);
  });

  it('returns false for standard dynamic strength exercises', () => {
    expect(isTimedOrIsometricExercise({ name: 'Press banca', activity_type: 'strength' })).toBe(false);
    expect(isTimedOrIsometricExercise({ name: 'Sentadilla con barra', activity_type: 'strength' })).toBe(false);
    expect(isTimedOrIsometricExercise({ name: 'Dominadas', activity_type: 'strength' })).toBe(false);
  });

  it('returns false for cardio and null/empty exercises', () => {
    expect(isTimedOrIsometricExercise({ name: 'Cinta de correr', activity_type: 'cardio' })).toBe(false);
    expect(isTimedOrIsometricExercise(null)).toBe(false);
    expect(isTimedOrIsometricExercise(undefined)).toBe(false);
  });
});

describe('formatTimerDisplay', () => {
  it('formats seconds into MM:SS format', () => {
    expect(formatTimerDisplay(0)).toBe('00:00');
    expect(formatTimerDisplay(5)).toBe('00:05');
    expect(formatTimerDisplay(45)).toBe('00:45');
    expect(formatTimerDisplay(60)).toBe('01:00');
    expect(formatTimerDisplay(90)).toBe('01:30');
    expect(formatTimerDisplay(125)).toBe('02:05');
  });

  it('handles negative or decimal inputs safely', () => {
    expect(formatTimerDisplay(-10)).toBe('00:00');
    expect(formatTimerDisplay(45.8)).toBe('00:45');
  });
});

describe('targetValue formatting', () => {
  it('formats cardio duration in minutes', () => {
    expect(targetValue({ duration_minutes: 20 }, { activity_type: 'cardio' })).toBe('20 min');
  });

  it('formats regular strength sets with weight and reps', () => {
    expect(targetValue({ reps: 10, weight: 80 }, { activity_type: 'strength', weight_mode: 'weighted' })).toBe('80 kg × 10');
    expect(targetValue({ reps: 12 }, { activity_type: 'strength', weight_mode: 'bodyweight' })).toBe('Peso corporal × 12');
  });

  it('formats isometric sets with seconds (s)', () => {
    expect(targetValue({ reps: 45 }, { name: 'Plancha', weight_mode: 'bodyweight' })).toBe('Peso corporal × 45s');
    expect(targetValue({ reps: 60, weight: 15 }, { name: 'Plank', weight_mode: 'weighted' })).toBe('15 kg × 60s');
    expect(targetValue({ duration_seconds: 30 }, { name: 'Dead Hang', weight_mode: 'unloaded' })).toBe('30s');
  });
});

describe('IsometricTimer component', () => {
  it('renders interactive controls and display in idle state', () => {
    const html = render(
      h(IsometricTimer, {
        targetSeconds: 45,
        onFinish: vi.fn(),
        onStopEarly: vi.fn(),
        onAdjustTime: vi.fn(),
      }),
    );

    expect(html).toContain('Cronómetro isométrico');
    expect(html).toContain('00:45');
    expect(html).toContain('Objetivo: 45s');
    expect(html).toContain('▶ Iniciar');
    expect(html).toContain('+10s');
    expect(html).toContain('+30s');
  });
});

describe('SetRow component rendering', () => {
  it('renders cardio row with duration in minutes', () => {
    const html = render(
      h(SetRow, {
        set: { id: 1, set_number: 1, duration_minutes: 20, is_warmup: false },
        target: { set_number: 1, duration_minutes: 20 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: 'cardio',
      }),
    );
    expect(html).toContain('20 min');
  });

  it('renders regular strength row with weight and reps', () => {
    const html = render(
      h(SetRow, {
        set: { id: 1, set_number: 1, reps: 10, weight: 60, weight_mode: 'weighted', is_warmup: false },
        target: { set_number: 1, reps: 10, weight: 60 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: 'strength',
      }),
    );
    expect(html).toContain('60 kg × 10');
  });

  it('renders isometric row with seconds (s)', () => {
    const html = render(
      h(SetRow, {
        set: { id: 1, set_number: 1, reps: 45, weight_mode: 'bodyweight', is_warmup: false },
        target: { set_number: 1, reps: 45 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: 'strength',
        isTimed: true,
      }),
    );
    expect(html).toContain('45s');
  });
});

describe('LogSetForm exercise metrics and isometric support', () => {
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
    expect(html).not.toContain('Cronómetro isométrico');
    expect(html).toContain('20 min');
  });

  it('keeps weight and reps for dynamic strength', () => {
    const html = renderForm({
      name: 'Press banca',
      activity_type: 'strength',
      reps: 10,
      weight: 40,
    });

    expect(html).toContain('Peso (kg)');
    expect(html).toContain('>Reps<');
    expect(html).not.toContain('Segundos (s)');
    expect(html).not.toContain('Cronómetro isométrico');
    expect(html).not.toContain('Minutos');
  });

  it('embeds live isometric stopwatch and countdown timer for timed exercises', () => {
    const html = renderForm({
      name: 'Plancha abdominal',
      activity_type: 'strength',
      weight_mode: 'bodyweight',
      reps: 45,
      target_duration_seconds: 45,
    });

    expect(html).toContain('Segundos (s)');
    expect(html).toContain('value="45"');
    expect(html).toContain('Cronómetro isométrico');
    expect(html).toContain('00:45');
    expect(html).toContain('▶ Iniciar');
    expect(html).toContain('+10s');
    expect(html).toContain('+30s');
    expect(html).not.toContain('Minutos');
  });

  it('embeds live isometric stopwatch for explicit activity_type="timed"', () => {
    const html = renderForm({
      name: 'Dead Hang',
      activity_type: 'timed',
      weight_mode: 'bodyweight',
      reps: 30,
    });

    expect(html).toContain('Segundos (s)');
    expect(html).toContain('Cronómetro isométrico');
    expect(html).toContain('00:30');
    expect(html).toContain('▶ Iniciar');
  });

  it('prefills target seconds from previous set or set targets', () => {
    const html = render(
      h(LogSetForm, {
        sessionId: 1,
        exercise: {
          planned_id: 2,
          exercise_id: 3,
          name: 'Wall sit',
          activity_type: 'strength',
          weight_mode: 'bodyweight',
          performed_sets: [{ set_number: 1, reps: 50 }],
          set_targets: [{ set_number: 2, reps: 55 }],
        },
        nextSetNumber: 2,
        remainingSetCount: 1,
        onShowPicker: () => undefined,
      }),
    );

    expect(html).toContain('Segundos (s)');
    expect(html).toContain('value="55"');
    expect(html).toContain('00:55');
  });
});

