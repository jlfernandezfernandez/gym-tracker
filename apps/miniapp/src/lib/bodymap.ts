/**
 * BodyMap calculations, color resolvers, and legacy helper adapters.
 */
import {
  type CanonicalMuscle,
  type BodyPartId,
  CANONICAL_MUSCLES,
  ANTERIOR_PATHS,
  POSTERIOR_PATHS,
  formatMuscleName,
  normalizeMuscle,
} from './body-paths';

export type BodyMapMode = 'fatigue' | 'balance';

export interface MuscleRecoveryInfo {
  muscle: string;
  readiness_pct: number;
  fatigue_pct: number;
  status: 'ready' | 'recovering' | 'fatigued';
  last_trained_hours?: number | null;
  last_trained_date?: string | null;
}

export interface BodyMapColorState {
  fill: string;
  opacity?: number;
  highlighted: boolean;
  tier?: number; // 0-4
  recovery?: MuscleRecoveryInfo;
  volume?: number;
}

// Semantic colors
export const COLOR_READY = '#34c759'; // Apple OK Bright green
export const COLOR_RECOVERING = '#ff9f0a'; // Amber
export const COLOR_FATIGUED = '#ff453a'; // Apple Red
export const COLOR_ACCENT = '#5856d6'; // Primary brand accent
export const COLOR_BASE_INERT = 'var(--color-surface-2, #2c2c2e)';
export const COLOR_BASE_UNSELECTED = 'var(--color-track-dim, #3a3a3c)';

export const VOLUME_TIER_COLORS = [
  'var(--color-track-dim, #3a3a3c)', // Level 0: Neglected / 0 sets
  'rgba(88, 86, 214, 0.35)',        // Level 1: Light (1-2 sets)
  'rgba(88, 86, 214, 0.60)',        // Level 2: Moderate (3-4 sets)
  'rgba(88, 86, 214, 0.85)',        // Level 3: High (5-7 sets)
  '#5856d6',                        // Level 4: Peak (8+ sets)
];

/**
 * Compute the 0-4 volume tier given a value and max value (or fixed set thresholds)
 */
export function computeVolumeTier(value: number, maxValue: number = 0): number {
  if (!value || value <= 0) return 0;
  if (maxValue > 0) {
    const ratio = value / maxValue;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.50) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  }
  // Absolute set fallback
  if (value >= 8) return 4;
  if (value >= 5) return 3;
  if (value >= 3) return 2;
  return 1;
}

/**
 * Resolve the color and status of a muscle part according to the active mode
 */
export function resolvePartColor({
  partId,
  isInert,
  mode,
  highlightedMuscles,
  recoveryMap,
  volumeMap,
  maxVolume,
}: {
  partId: BodyPartId;
  isInert?: boolean;
  mode?: BodyMapMode;
  highlightedMuscles?: Set<CanonicalMuscle>;
  recoveryMap?: Map<CanonicalMuscle, MuscleRecoveryInfo>;
  volumeMap?: Map<CanonicalMuscle, number>;
  maxVolume?: number;
}): BodyMapColorState {
  if (isInert) {
    return {
      fill: COLOR_BASE_INERT,
      highlighted: false,
    };
  }

  const muscle = partId as CanonicalMuscle;

  // 1. Fatigue / Recovery Mode
  if (mode === 'fatigue' && recoveryMap) {
    const info = recoveryMap.get(muscle);
    if (!info) {
      // Untrained / fully rested fallback
      return {
        fill: COLOR_BASE_UNSELECTED,
        highlighted: false,
        recovery: {
          muscle,
          readiness_pct: 100,
          fatigue_pct: 0,
          status: 'ready',
        },
      };
    }
    const isReady = info.status === 'ready' || info.readiness_pct >= 75;
    const isRec = info.status === 'recovering' || (info.readiness_pct >= 45 && info.readiness_pct < 75);
    const fill = isReady ? COLOR_READY : isRec ? COLOR_RECOVERING : COLOR_FATIGUED;
    return {
      fill,
      highlighted: true,
      recovery: info,
    };
  }

  // 2. Balance / Volume Mode
  if (mode === 'balance' && volumeMap) {
    const vol = volumeMap.get(muscle) || 0;
    const tier = computeVolumeTier(vol, maxVolume);
    return {
      fill: VOLUME_TIER_COLORS[tier],
      highlighted: tier > 0,
      tier,
      volume: vol,
    };
  }

  // 3. Simple Highlight / Default Mode
  if (highlightedMuscles && highlightedMuscles.has(muscle)) {
    return {
      fill: COLOR_ACCENT,
      highlighted: true,
    };
  }

  return {
    fill: COLOR_BASE_UNSELECTED,
    highlighted: false,
  };
}

/**
 * Normalizes input recovery data (array or object) into a Map of CanonicalMuscle -> MuscleRecoveryInfo
 */
export function normalizeRecoveryData(
  input?: Record<string, MuscleRecoveryInfo> | MuscleRecoveryInfo[] | null,
): Map<CanonicalMuscle, MuscleRecoveryInfo> {
  const map = new Map<CanonicalMuscle, MuscleRecoveryInfo>();
  if (!input) return map;

  const entries: MuscleRecoveryInfo[] = Array.isArray(input) ? input : Object.values(input);
  for (const item of entries) {
    if (!item?.muscle) continue;
    const norm = normalizeMuscle(item.muscle);
    if (norm) {
      map.set(norm, {
        ...item,
        muscle: norm,
      });
    }
  }
  return map;
}

/**
 * Normalizes input volume data into a Map of CanonicalMuscle -> number
 */
export function normalizeVolumeData(
  input?: Record<string, number> | null,
): { map: Map<CanonicalMuscle, number>; max: number } {
  const map = new Map<CanonicalMuscle, number>();
  let max = 0;
  if (!input) return { map, max };

  for (const [key, val] of Object.entries(input)) {
    const norm = normalizeMuscle(key);
    if (norm) {
      const current = map.get(norm) || 0;
      const updated = current + (Number(val) || 0);
      map.set(norm, updated);
      if (updated > max) max = updated;
    }
  }
  return { map, max };
}
