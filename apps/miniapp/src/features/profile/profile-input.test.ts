import { describe, expect, it } from 'vitest';

import { buildProfileFieldPatch } from './profile-input';

describe('buildProfileFieldPatch', () => {
  it('accepts decimal comma input for numeric profile fields', () => {
    expect(buildProfileFieldPatch('weight_kg', '72,5')).toEqual({
      payload: { weight_kg: 72.5 },
    });
  });

  it('rejects garbage input without mutating unrelated fields', () => {
    expect(buildProfileFieldPatch('weight_kg', 'abc')).toEqual({
      error: 'Introduce un numero valido para Peso (kg).',
    });
  });

  it('keeps the patch payload scoped to the edited field only', () => {
    expect(buildProfileFieldPatch('age', '33')).toEqual({
      payload: { age: 33 },
    });
  });
});