import { describe, expect, it } from 'vitest';

import { parseLaunchRoute } from './routes';

describe('parseLaunchRoute', () => {
  it('parses authenticated owner routes as editable session navigation', () => {
    expect(parseLaunchRoute('/session/12/exercise/7')).toEqual({
      sessionId: 12,
      plannedExerciseId: 7,
      shareToken: undefined,
      readOnly: false,
    });
  });

  it('keeps share-token routes read-only even when an exercise is targeted', () => {
    expect(parseLaunchRoute('/session/share/demo-token/exercise/5')).toEqual({
      sessionId: undefined,
      plannedExerciseId: 5,
      shareToken: 'demo-token',
      readOnly: true,
    });
  });

  it('rejects invalid ids instead of treating them as writable owner routes', () => {
    expect(parseLaunchRoute('/session/not-a-number/exercise/7')).toEqual({
      sessionId: undefined,
      plannedExerciseId: undefined,
      shareToken: undefined,
      readOnly: false,
    });
    expect(parseLaunchRoute('/session/12/exercise/nope')).toEqual({
      sessionId: 12,
      plannedExerciseId: undefined,
      shareToken: undefined,
      readOnly: false,
    });
  });
});