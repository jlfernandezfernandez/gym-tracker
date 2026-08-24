import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it, vi } from 'vitest';
import { BodyMap } from './BodyMap';

describe('BodyMap component rendering', () => {
  it('renders front (anterior) and back (posterior) SVG diagrams', () => {
    const html = render(h(BodyMap, {}));
    expect(html).toContain('Vista frontal');
    expect(html).toContain('Vista dorsal');
    expect(html).toContain('Frente');
    expect(html).toContain('Espalda');
    expect(html).toContain('data-muscle="chest"');
    expect(html).toContain('data-muscle="quadriceps"');
    expect(html).toContain('data-muscle="upper-back"');
    expect(html).toContain('data-muscle="gluteal"');
  });

  it('renders simple highlighted muscles in accent color', () => {
    const html = render(h(BodyMap, { muscles: ['chest', 'biceps'] }));
    expect(html).toContain('data-muscle="chest"');
    expect(html).toContain('data-muscle="biceps"');
  });

  it('renders in Mode 1 (Fatigue / Recovery) with status colors', () => {
    const recoveryData = {
      quadriceps: {
        muscle: 'quadriceps',
        readiness_pct: 85,
        fatigue_pct: 15,
        status: 'ready' as const,
        hours_since_trained: 36,
      },
      chest: {
        muscle: 'chest',
        readiness_pct: 35,
        fatigue_pct: 65,
        status: 'fatigued' as const,
        hours_since_trained: 12,
      },
    };

    const html = render(
      h(BodyMap, {
        mode: 'fatigue',
        recoveryData,
        selectedMuscle: 'quadriceps',
        showPopover: true,
      }),
    );

    expect(html).toContain('Cuádriceps');
    expect(html).toContain('Listo');
    expect(html).toContain('85%');
  });

  it('renders in Mode 2 (Balance / Volume) with volume tiers and legend', () => {
    const volumeData = {
      chest: 8,
      deltoids: 4,
      biceps: 2,
    };

    const html = render(
      h(BodyMap, {
        mode: 'balance',
        volumeData,
        selectedMuscle: 'chest',
        showLegend: true,
        showPopover: true,
      }),
    );

    expect(html).toContain('Pecho');
    expect(html).toContain('8 series');
    expect(html).toContain('Mayor volumen');
  });

  it('renders mode selector buttons when showModeSelector is true', () => {
    const html = render(
      h(BodyMap, {
        showModeSelector: true,
      }),
    );

    expect(html).toContain('Recuperación');
    expect(html).toContain('Volumen');
  });

  it('highlights the selected muscle with an active outline', () => {
    const html = render(
      h(BodyMap, {
        selectedMuscle: 'abs',
      }),
    );

    expect(html).toContain('data-muscle="abs" data-selected="true"');
    expect(html).toContain('Abdominales');
  });
});
