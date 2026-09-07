import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function themeColor(token: string, mode: 'light' | 'dark') {
  const value = theme.match(new RegExp(`--color-${token}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing color token: ${token}`);
  const colors = value.match(/#[\da-f]{3,6}\b/gi);
  if (!colors?.length) throw new Error(`Expected hex colors: ${token}`);
  return colors[mode === 'dark' && colors.length > 1 ? 1 : 0];
}

function luminance(hex: string) {
  const digits = hex.slice(1);
  const fullHex = digits.length === 3 ? [...digits].map((digit) => digit.repeat(2)).join('') : digits;
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(fullHex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe('accent text contrast', () => {
  it('preserves the light brand color', () => {
    expect(themeColor('accent', 'light')).toBe('#5856d6');
  });

  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: text on solid accent controls meets WCAG AA`, () => {
      const foreground = luminance(themeColor('on-accent', mode));
      const background = luminance(themeColor('accent', mode));
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['surface', 'surface-2', 'accent-bg'])(`${mode}: normal text on %s meets WCAG AA`, (surface) => {
      const foreground = luminance(themeColor('accent', mode));
      const background = luminance(themeColor(surface, mode));
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});