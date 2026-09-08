import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMeasurementChart, renderProgressChart, type ProgressPoint } from './chart';

vi.mock('chart.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('chart.js')>();
  return {
    ...original,
    Chart: class {
      static register() {}
      constructor(_canvas: unknown, public config: unknown) {}
    },
  };
});

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, remove() {} }),
    documentElement: { appendChild() {} },
  });
  vi.stubGlobal('getComputedStyle', () => ({ color: '#123456' }));
});
afterEach(() => vi.unstubAllGlobals());

const canvas = {} as HTMLCanvasElement;
const point: ProgressPoint = {
  date: '2026-09-08', top_weight: 2.25, activity_type: 'strength',
  weight_mode: 'weighted', top_reps: 8, volume: 18.25, sets: 3,
};

describe('chart number presentation', () => {
  it('leaves floating-point progress values untouched while formatting their tooltip', () => {
    const input = { ...point, top_weight: 0.1 + 0.2, volume: 1.23456 };
    const config = renderProgressChart(canvas, [input]).config as any;
    expect(config.data.datasets[0].data).toEqual([0.30000000000000004]);
    expect(config.options.plugins.tooltip.callbacks.label({ dataIndex: 0 })).toEqual([
      'máx 0,3 kg', '3 series · 1,23 kg vol',
    ]);
    expect(input.top_weight).toBe(0.30000000000000004);
    expect(input.volume).toBe(1.23456);
  });

  it.each([
    ['weight', {}, 'kg', '3 series · 18,25 kg vol'],
    ['minutes', { activity_type: 'cardio', top_duration_minutes: 2.25 }, 'min', '3 bloques'],
    ['seconds', { execution_metric: 'duration_seconds', top_duration_seconds: 2.25 }, 's', '3 series'],
    ['reps', { weight_mode: 'bodyweight', top_reps: 2.25 }, 'reps', '3 series'],
  ] as const)('formats %s ticks and tooltips without changing data', (_metric, overrides, unit, detail) => {
    const input = { ...point, ...overrides } as ProgressPoint;
    const chart = renderProgressChart(canvas, [input]);
    const config = chart.config as any;
    const tick = config.options.scales.y.ticks.callback;
    expect(tick(0.1 + 0.2)).toBe(`0,3 ${unit}`);
    expect(tick(2.25)).toBe(`2,25 ${unit}`);
    expect(tick(2)).toBe(`2 ${unit}`);
    expect(config.options.plugins.tooltip.callbacks.label({ dataIndex: 0 })).toEqual([
      `máx 2,25 ${unit}`, detail,
    ]);
    expect(config.data.datasets[0].data).toEqual([2.25]);
    expect(input.volume).toBe(18.25);
  });

  it.each(['kg', ' kg', '%', ''])('formats measurement axes and tooltips with unit "%s"', (unit) => {
    const points = [{ date: '2026-09-08', value: 2.25 }, { date: '2026-09-09', value: 0.1 + 0.2 }];
    const chart = renderMeasurementChart(canvas, points, unit);
    const config = chart.config as any;
    const suffix = unit.trim() ? ` ${unit.trim()}` : '';
    expect(config.options.scales.y.ticks.callback(2.25)).toBe(`2,25${suffix}`);
    expect(config.options.scales.y.ticks.callback(1.23456)).toBe(`1,23${suffix}`);
    expect(config.options.plugins.tooltip.callbacks.label({ parsed: { y: 0.1 + 0.2 } })).toBe(`0,3${suffix}`);
    expect(config.options.plugins.tooltip.callbacks.label({ parsed: { y: 2.25 } })).toBe(`2,25${suffix}`);
    expect(config.data.datasets[0].data).toEqual([2.25, 0.30000000000000004]);
    expect(points[1].value).toBe(0.30000000000000004);
  });
});