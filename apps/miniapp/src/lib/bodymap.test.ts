import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MUSCLES,
  ANTERIOR_PATHS,
  POSTERIOR_PATHS,
  MUSCLE_LABELS_ES,
  formatMuscleName,
  normalizeMuscle,
} from './body-paths';
import {
  COLOR_FATIGUED,
  COLOR_READY,
  COLOR_RECOVERING,
  VOLUME_TIER_COLORS,
  computeVolumeTier,
  normalizeRecoveryData,
  normalizeVolumeData,
  resolvePartColor,
} from './bodymap';

describe('body-paths taxonomy and canonical normalization', () => {
  it('contains exactly 18 canonical anatomical muscle groups', () => {
    expect(CANONICAL_MUSCLES).toHaveLength(18);
    expect(CANONICAL_MUSCLES).toEqual([
      'trapezius',
      'deltoids',
      'chest',
      'upper-back',
      'serratus',
      'biceps',
      'triceps',
      'forearm',
      'abs',
      'obliques',
      'lower-back',
      'gluteal',
      'quadriceps',
      'hamstring',
      'adductors',
      'hip-flexors',
      'calves',
      'tibialis',
    ]);
  });

  it('normalizes common aliases and free-text terms to canonical slugs', () => {
    expect(normalizeMuscle('quads')).toBe('quadriceps');
    expect(normalizeMuscle('Cuádriceps')).toBe('quadriceps');
    expect(normalizeMuscle('pectorals')).toBe('chest');
    expect(normalizeMuscle('pecho')).toBe('chest');
    expect(normalizeMuscle('lats')).toBe('upper-back');
    expect(normalizeMuscle('latissimus dorsi')).toBe('upper-back');
    expect(normalizeMuscle('dorsales')).toBe('upper-back');
    expect(normalizeMuscle('glutes')).toBe('gluteal');
    expect(normalizeMuscle('glúteos')).toBe('gluteal');
    expect(normalizeMuscle('shoulders')).toBe('deltoids');
    expect(normalizeMuscle('front-deltoids')).toBe('deltoids');
    expect(normalizeMuscle('hamstrings')).toBe('hamstring');
    expect(normalizeMuscle('isquiotibiales')).toBe('hamstring');
    expect(normalizeMuscle('spine')).toBe('lower-back');
    expect(normalizeMuscle('lumbar')).toBe('lower-back');
    expect(normalizeMuscle('traps')).toBe('trapezius');
    expect(normalizeMuscle('trapecio')).toBe('trapezius');
    expect(normalizeMuscle('soleus')).toBe('calves');
    expect(normalizeMuscle('shins')).toBe('tibialis');
    expect(normalizeMuscle('tibiales')).toBe('tibialis');
    expect(normalizeMuscle('forearms')).toBe('forearm');
    expect(normalizeMuscle('antebrazos')).toBe('forearm');
  });

  it('drops inert or unmapped anatomy gracefully', () => {
    expect(normalizeMuscle('cardio')).toBeNull();
    expect(normalizeMuscle('cardiovascular system')).toBeNull();
    expect(normalizeMuscle('feet')).toBeNull();
    expect(normalizeMuscle('')).toBeNull();
    expect(normalizeMuscle(null)).toBeNull();
    expect(normalizeMuscle(undefined)).toBeNull();
  });

  it('formats Spanish labels for all 18 canonical muscles', () => {
    for (const slug of CANONICAL_MUSCLES) {
      expect(MUSCLE_LABELS_ES[slug]).toBeDefined();
      expect(formatMuscleName(slug)).toBe(MUSCLE_LABELS_ES[slug]);
    }
    expect(formatMuscleName('quads')).toBe('Cuádriceps');
    expect(formatMuscleName('lats')).toBe('Espalda alta');
  });

  it('provides valid SVG polygon paths for anterior and posterior views', () => {
    expect(ANTERIOR_PATHS.length).toBeGreaterThan(15);
    expect(POSTERIOR_PATHS.length).toBeGreaterThan(15);

    for (const p of ANTERIOR_PATHS) {
      expect(p.points.trim().length).toBeGreaterThan(5);
      expect(p.view).toBe('anterior');
    }
    for (const p of POSTERIOR_PATHS) {
      expect(p.points.trim().length).toBeGreaterThan(5);
      expect(p.view).toBe('posterior');
    }
  });
});

describe('bodymap color resolver & 3-mode logic', () => {
  describe('Mode 1: Fatigue / Recovery', () => {
    const recoveryMap = normalizeRecoveryData({
      quadriceps: {
        muscle: 'quadriceps',
        readiness_pct: 90,
        fatigue_pct: 10,
        status: 'ready',
      },
      chest: {
        muscle: 'chest',
        readiness_pct: 60,
        fatigue_pct: 40,
        status: 'recovering',
      },
      hamstrings: {
        muscle: 'hamstrings',
        readiness_pct: 30,
        fatigue_pct: 70,
        status: 'fatigued',
      },
    });

    it('assigns Green (COLOR_READY) to ready muscles (>=75%)', () => {
      const state = resolvePartColor({
        partId: 'quadriceps',
        mode: 'fatigue',
        recoveryMap,
      });
      expect(state.fill).toBe(COLOR_READY);
      expect(state.highlighted).toBe(true);
      expect(state.recovery?.readiness_pct).toBe(90);
    });

    it('assigns Amber (COLOR_RECOVERING) to recovering muscles (45%-74%)', () => {
      const state = resolvePartColor({
        partId: 'chest',
        mode: 'fatigue',
        recoveryMap,
      });
      expect(state.fill).toBe(COLOR_RECOVERING);
      expect(state.highlighted).toBe(true);
      expect(state.recovery?.readiness_pct).toBe(60);
    });

    it('assigns Red (COLOR_FATIGUED) to fatigued muscles (<45%)', () => {
      const state = resolvePartColor({
        partId: 'hamstring',
        mode: 'fatigue',
        recoveryMap,
      });
      expect(state.fill).toBe(COLOR_FATIGUED);
      expect(state.highlighted).toBe(true);
      expect(state.recovery?.readiness_pct).toBe(30);
    });

    it('falls back to rested/unshaded state for muscles without fatigue data', () => {
      const state = resolvePartColor({
        partId: 'biceps',
        mode: 'fatigue',
        recoveryMap,
      });
      expect(state.highlighted).toBe(false);
      expect(state.recovery?.readiness_pct).toBe(100);
    });
  });

  describe('Mode 2: Balance / Volume', () => {
    it('computes volume tiers 0 to 4 correctly', () => {
      expect(computeVolumeTier(0, 10)).toBe(0);
      expect(computeVolumeTier(2, 10)).toBe(1); // 20% -> tier 1
      expect(computeVolumeTier(3, 10)).toBe(2); // 30% -> tier 2
      expect(computeVolumeTier(6, 10)).toBe(3); // 60% -> tier 3
      expect(computeVolumeTier(9, 10)).toBe(4); // 90% -> tier 4
    });

    it('shades muscles with progressive accent tiers', () => {
      const { map: volumeMap, max: maxVolume } = normalizeVolumeData({
        chest: 10,
        biceps: 5,
        triceps: 2,
        glutes: 0,
      });

      const chestState = resolvePartColor({
        partId: 'chest',
        mode: 'balance',
        volumeMap,
        maxVolume,
      });
      expect(chestState.tier).toBe(4);
      expect(chestState.fill).toBe(VOLUME_TIER_COLORS[4]);

      const bicepsState = resolvePartColor({
        partId: 'biceps',
        mode: 'balance',
        volumeMap,
        maxVolume,
      });
      expect(bicepsState.tier).toBe(3);
      expect(bicepsState.fill).toBe(VOLUME_TIER_COLORS[3]);

      const glutealState = resolvePartColor({
        partId: 'gluteal',
        mode: 'balance',
        volumeMap,
        maxVolume,
      });
      expect(glutealState.tier).toBe(0);
      expect(glutealState.highlighted).toBe(false);
    });
  });

  describe('Inert parts handling', () => {
    it('renders head, neck, hands, feet in base inert style without load', () => {
      const state = resolvePartColor({
        partId: 'head',
        isInert: true,
        mode: 'fatigue',
      });
      expect(state.highlighted).toBe(false);
    });
  });
});
