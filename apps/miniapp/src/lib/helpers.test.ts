import { describe, expect, it } from 'vitest';
import { formatSetTarget, formatWeight, parseWeight } from './helpers';

describe('parseWeight', () => {
  it('parses comma decimal', () => {
    expect(parseWeight('2,5')).toBe(2.5);
  });

  it('parses dot decimal', () => {
    expect(parseWeight('2.5')).toBe(2.5);
  });

  it('parses integer', () => {
    expect(parseWeight('10')).toBe(10);
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseWeight('abc')).toBeNaN();
  });
});

describe('formatWeight', () => {
  it('formats bodyweight mode', () => {
    expect(formatWeight(null, 'bodyweight')).toBe('Peso corporal');
    expect(formatWeight(-1, 'bodyweight')).toBe('Peso corporal');
  });

  it('formats weighted mode', () => {
    expect(formatWeight(12.5, 'weighted')).toBe('12.5 kg');
  });

  it('formats unloaded mode with null/undefined', () => {
    expect(formatWeight(null, 'unloaded')).toBe('');
    expect(formatWeight(undefined, 'unloaded')).toBe('');
  });

  it('formats weighted/unloaded with numeric 0', () => {
    expect(formatWeight(0, 'weighted')).toBe('0 kg');
    expect(formatWeight(0, 'unloaded')).toBe('0 kg');
  });
});

describe('formatSetTarget', () => {
  it('formats each prescribed set as its own labelled value', () => {
    expect(formatSetTarget({ set_number: 1, weight: 90, reps: 12 }, 'weighted')).toBe('S1 · 90 kg × 12');
    expect(formatSetTarget({ set_number: 2, weight: null, reps: 8 }, 'bodyweight')).toBe('S2 · Peso corporal × 8');
    expect(formatSetTarget({ set_number: 3, weight: null, reps: 15 }, 'unloaded')).toBe('S3 · 15 reps');
  });
});

