import { describe, expect, it } from 'vitest';
import { parseWeight, formatWeight } from './helpers';

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

