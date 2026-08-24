/**
 * Standalone SVG Body Geometry, Canonical Taxonomy & Shading Utilities.
 * Covers 18 canonical anatomical muscle groups and inert silhouette parts
 * across Anterior (Front) and Posterior (Back) views.
 */

export const CANONICAL_MUSCLES = [
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
] as const;

export type CanonicalMuscle = (typeof CANONICAL_MUSCLES)[number];

export const INERT_PARTS = [
  'head',
  'neck',
  'hands',
  'feet',
  'knees',
  'ankles',
] as const;

export type InertPart = (typeof INERT_PARTS)[number];

export type BodyPartId = CanonicalMuscle | InertPart;

export const MUSCLE_LABELS_ES: Record<CanonicalMuscle, string> = {
  trapezius: 'Trapecio',
  deltoids: 'Hombros',
  chest: 'Pecho',
  'upper-back': 'Espalda alta',
  serratus: 'Serrato',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearm: 'Antebrazos',
  abs: 'Abdominales',
  obliques: 'Oblicuos',
  'lower-back': 'Espalda baja',
  gluteal: 'Glúteos',
  quadriceps: 'Cuádriceps',
  hamstring: 'Isquiotibiales',
  adductors: 'Aductores',
  'hip-flexors': 'Flexores de cadera',
  calves: 'Gemelos',
  tibialis: 'Tibiales',
};

export const INERT_LABELS_ES: Record<InertPart, string> = {
  head: 'Cabeza',
  neck: 'Cuello',
  hands: 'Manos',
  feet: 'Pies',
  knees: 'Rodillas',
  ankles: 'Tobillos',
};

export const MUSCLE_ALIASES: Record<string, CanonicalMuscle | null> = {
  // Primaries
  abs: 'abs',
  abdominals: 'abs',
  'lower abs': 'abs',
  core: 'abs',
  abdomen: 'abs',
  waist: 'abs',
  pectorals: 'chest',
  chest: 'chest',
  'upper chest': 'chest',
  pecho: 'chest',
  glutes: 'gluteal',
  gluteal: 'gluteal',
  gluteus: 'gluteal',
  gluteos: 'gluteal',
  glúteos: 'gluteal',
  biceps: 'biceps',
  bicep: 'biceps',
  bíceps: 'biceps',
  triceps: 'triceps',
  tricep: 'triceps',
  tríceps: 'triceps',
  delts: 'deltoids',
  deltoids: 'deltoids',
  deltoid: 'deltoids',
  shoulders: 'deltoids',
  hombros: 'deltoids',
  'front-deltoids': 'deltoids',
  'back-deltoids': 'deltoids',
  'rear deltoids': 'deltoids',
  'rotator cuff': 'deltoids',
  triceps: 'triceps',
  tricep: 'triceps',
  'upper back': 'upper-back',
  'upper-back': 'upper-back',
  'espalda alta': 'upper-back',
  back: 'upper-back',
  espalda: 'upper-back',
  lats: 'upper-back',
  'latissimus dorsi': 'upper-back',
  dorsales: 'upper-back',
  dorsal: 'upper-back',
  rhomboids: 'upper-back',
  romboides: 'upper-back',
  calves: 'calves',
  calf: 'calves',
  gemelos: 'calves',
  soleus: 'calves',
  'left-soleus': 'calves',
  'right-soleus': 'calves',
  quads: 'quadriceps',
  quadriceps: 'quadriceps',
  cuadriceps: 'quadriceps',
  cuádriceps: 'quadriceps',
  forearms: 'forearm',
  forearm: 'forearm',
  antebrazos: 'forearm',
  wrists: 'forearm',
  'wrist flexors': 'forearm',
  'wrist extensors': 'forearm',
  'grip muscles': 'forearm',
  'lower arms': 'forearm',
  hamstrings: 'hamstring',
  hamstring: 'hamstring',
  isquiotibiales: 'hamstring',
  isquios: 'hamstring',
  spine: 'lower-back',
  'lower back': 'lower-back',
  'lower-back': 'lower-back',
  'espalda baja': 'lower-back',
  lumbar: 'lower-back',
  lumbares: 'lower-back',
  traps: 'trapezius',
  trapezius: 'trapezius',
  trapecio: 'trapezius',
  'levator scapulae': 'trapezius',
  adductors: 'adductors',
  adductor: 'adductors',
  aductores: 'adductors',
  groin: 'adductors',
  'inner thighs': 'adductors',
  abductors: 'gluteal',
  abductores: 'gluteal',
  serratus: 'serratus',
  'serratus anterior': 'serratus',
  serrato: 'serratus',
  'hip flexors': 'hip-flexors',
  'hip-flexors': 'hip-flexors',
  'flexores de cadera': 'hip-flexors',
  shins: 'tibialis',
  tibialis: 'tibialis',
  tibiales: 'tibialis',
  obliques: 'obliques',
  oblicuos: 'obliques',
  // Non-muscle / Inert / Fallbacks
  neck: 'trapezius',
  'upper legs': 'quadriceps',
  'lower legs': 'calves',
  'upper arms': 'biceps',
  cardio: null,
  'cardiovascular system': null,
  ankles: null,
  feet: null,
  hands: null,
  'ankle stabilizers': null,
  sternocleidomastoid: null,
};

/** Normalize any raw muscle/exercise string to canonical slug */
export function normalizeMuscle(raw: string | null | undefined): CanonicalMuscle | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (CANONICAL_MUSCLES.includes(key as CanonicalMuscle)) {
    return key as CanonicalMuscle;
  }
  if (key in MUSCLE_ALIASES) {
    return MUSCLE_ALIASES[key];
  }
  // Try stripped diacritics
  const stripped = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (CANONICAL_MUSCLES.includes(stripped as CanonicalMuscle)) {
    return stripped as CanonicalMuscle;
  }
  if (stripped in MUSCLE_ALIASES) {
    return MUSCLE_ALIASES[stripped];
  }
  return null;
}

export function formatMuscleName(slug: string): string {
  const norm = normalizeMuscle(slug);
  if (norm && MUSCLE_LABELS_ES[norm]) {
    return MUSCLE_LABELS_ES[norm];
  }
  const clean = String(slug || '').trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
}

export interface SVGPathElementData {
  id: BodyPartId;
  name: string;
  points: string;
  isInert?: boolean;
  view: 'anterior' | 'posterior';
}

/**
 * High-precision polygon point definitions for 100 x 210 SVG viewBox
 */
export const ANTERIOR_PATHS: SVGPathElementData[] = [
  // Inert Head & Neck
  {
    id: 'head',
    name: 'Cabeza',
    isInert: true,
    view: 'anterior',
    points: '42.4 2.8 40 11.8 42 19.5 46.1 23.2 49.8 25.3 54.7 22.4 57.5 19.1 59.2 10.2 57.1 2.4 49.8 0',
  },
  {
    id: 'neck',
    name: 'Cuello',
    isInert: true,
    view: 'anterior',
    points: '46.1 23.2 49.8 25.3 53.9 23.2 52.8 33.5 47.2 33.5',
  },
  // Trapezius (Anterior collar)
  {
    id: 'trapezius',
    name: 'Trapecio',
    view: 'anterior',
    points: '55.5 23.6 50.6 33.4 50.6 39.1 61.6 40 70.6 44.8 69.3 36.7 63.2 35.1 58.3 30.6',
  },
  {
    id: 'trapezius',
    name: 'Trapecio',
    view: 'anterior',
    points: '28.9 44.8 30.2 37.1 36.3 35.1 41.2 30.2 44.4 24.4 48.9 33.8 48.5 39.1 37.9 39.5',
  },
  // Deltoids (Front)
  {
    id: 'deltoids',
    name: 'Hombros',
    view: 'anterior',
    points: '78.3 53 79.5 47.7 79.1 41.2 75.9 37.9 71 36.3 72.2 42.8 71.4 47.3',
  },
  {
    id: 'deltoids',
    name: 'Hombros',
    view: 'anterior',
    points: '28.1 47.3 21.2 53 20 47.7 20.4 40.8 24.4 37.1 28.5 37.1 26.9 43.2',
  },
  // Chest
  {
    id: 'chest',
    name: 'Pecho',
    view: 'anterior',
    points: '51.8 41.6 51 55.1 57.9 57.9 67.7 55.5 70.6 47.3 62 41.6',
  },
  {
    id: 'chest',
    name: 'Pecho',
    view: 'anterior',
    points: '29.8 46.5 31.4 55.5 40.8 57.9 48.1 55.1 47.7 42 37.5 42',
  },
  // Biceps
  {
    id: 'biceps',
    name: 'Bíceps',
    view: 'anterior',
    points: '16.7 68.1 17.9 71.4 22.8 66.1 28.9 53.8 27.7 49.3 20.4 55.9',
  },
  {
    id: 'biceps',
    name: 'Bíceps',
    view: 'anterior',
    points: '71.4 49.3 70.2 54.6 76.3 66.1 81.6 71.8 82.8 68.9 78.7 55.5',
  },
  // Triceps (Anterior lateral view)
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'anterior',
    points: '69.3 55.5 69.3 61.6 75.9 72.6 77.5 70.2 75.5 67.3',
  },
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'anterior',
    points: '22.4 69.3 29.8 55.5 29.8 60.8 22.8 73',
  },
  // Serratus
  {
    id: 'serratus',
    name: 'Serrato',
    view: 'anterior',
    points: '31.4 55.5 30.2 63.2 32.2 64.0 38.5 59.0',
  },
  {
    id: 'serratus',
    name: 'Serrato',
    view: 'anterior',
    points: '68.5 55.5 69.7 63.2 67.7 64.0 61.5 59.0',
  },
  // Abs
  {
    id: 'abs',
    name: 'Abdominales',
    view: 'anterior',
    points: '43.6 58.7 48.5 57.1 48.9 67.3 48.5 84.5 48.1 107.3 44.5 103.6 40.8 91.4 40.8 78.3 41.2 64.5',
  },
  {
    id: 'abs',
    name: 'Abdominales',
    view: 'anterior',
    points: '56.3 59.1 57.9 64.1 58.3 77.9 58.3 92.6 56.3 98.3 55.1 104.1 51.4 107.7 51 84.5 50.6 67.3 51 57.1',
  },
  // Obliques
  {
    id: 'obliques',
    name: 'Oblicuos',
    view: 'anterior',
    points: '33.8 78.3 33 71.8 31 63.2 32.2 57.1 40.8 59.2 39.2 63.2 39.2 83.7',
  },
  {
    id: 'obliques',
    name: 'Oblicuos',
    view: 'anterior',
    points: '68.5 63.2 67.3 57.1 58.8 59.6 60 64.1 60.4 83.3 65.7 78.8 66.5 69.8',
  },
  // Forearm
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'anterior',
    points: '6.1 88.5 10.2 75.1 14.6 70.2 16.3 74.2 19.1 73.4 4.5 97.5 0 100',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'anterior',
    points: '6.9 101.2 13.4 90.6 18.7 84 21.6 77.1 21.2 71.8 4.9 98.7',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'anterior',
    points: '84.5 69.8 83.2 73.4 80 73 95.1 98.3 100 100.4 93.5 89.3 89.8 76.3',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'anterior',
    points: '77.5 72.2 77.5 77.5 80.4 84 85.3 89.8 92.2 101.2 94.7 99.6',
  },
  // Hands (Inert)
  {
    id: 'hands',
    name: 'Manos',
    isInert: true,
    view: 'anterior',
    points: '0 100 4.5 97.5 6.9 101.2 5 110 0 105',
  },
  {
    id: 'hands',
    name: 'Manos',
    isInert: true,
    view: 'anterior',
    points: '100 100.4 95.1 98.3 94.7 99.6 95 110 100 105',
  },
  // Hip Flexors
  {
    id: 'hip-flexors',
    name: 'Flexores de cadera',
    view: 'anterior',
    points: '39.6 92.2 41.6 99.2 43.6 105.3 47.7 110.6 44.9 125.3 42 115.9 40.4 113 39.6 107.3 37.9 102.4 34.7 93.8',
  },
  {
    id: 'hip-flexors',
    name: 'Flexores de cadera',
    view: 'anterior',
    points: '60.4 92.6 58.4 99.2 56.4 105.3 52.6 110.2 54.3 124.9 60 110.2 62 100 64.9 94.3',
  },
  // Adductors (Inner thighs)
  {
    id: 'adductors',
    name: 'Aductores',
    view: 'anterior',
    points: '44.9 125.3 47.7 110.6 48.5 128 44.5 135 41.2 118.3',
  },
  {
    id: 'adductors',
    name: 'Aductores',
    view: 'anterior',
    points: '54.3 124.9 52.6 110.2 51.5 128 55.5 135 58.8 118.3',
  },
  // Quadriceps
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '34.7 98.8 37.1 108.2 37.1 127.8 34.3 137.1 31 132.7 29.4 120 28.2 111.4 29.4 100.8 32.2 94.7',
  },
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '38.8 129.4 38.4 112.2 41.2 118.4 44.5 129.4 42.9 135.1 40 146.1 36.3 146.5 35.5 140',
  },
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '32.6 138.4 26.5 145.7 25.7 136.7 25.7 127.3 26.9 114.3 29.4 133.5',
  },
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '63.3 105.7 64.5 100 66.9 94.7 70.2 101.2 71 111.8 68.2 133.1 65.3 137.6 62.4 128.6 62 111.4',
  },
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '59.6 145.7 55.5 129 60.8 113.9 61.2 130.2 64.1 139.6 62.8 146.5',
  },
  {
    id: 'quadriceps',
    name: 'Cuádriceps',
    view: 'anterior',
    points: '71.8 113.1 73.9 124.1 73.9 140.4 72.7 145.7 66.5 138.4 70.2 133.5',
  },
  // Knees (Inert)
  {
    id: 'knees',
    name: 'Rodillas',
    isInert: true,
    view: 'anterior',
    points: '33.9 140 34.7 143.3 35.5 147.3 36.3 151 35.1 156.7 29.8 156.7 27.3 152.7 27.3 147.3 30.2 144.1',
  },
  {
    id: 'knees',
    name: 'Rodillas',
    isInert: true,
    view: 'anterior',
    points: '65.7 140 72.2 147.8 72.2 152.2 69.8 157.1 64.9 156.7 62.8 151',
  },
  // Tibialis (Shins)
  {
    id: 'tibialis',
    name: 'Tibiales',
    view: 'anterior',
    points: '29.8 158.8 28.9 169.8 28.6 175.5 28.2 180.4 27.3 187.8 26.9 194.7 30.6 187.3 32.2 182 35.1 176.7 35.1 172.2 35.9 166.9 35.9 162.4 35.5 158.4',
  },
  {
    id: 'tibialis',
    name: 'Tibiales',
    view: 'anterior',
    points: '70.2 158.8 71.1 169.8 71.4 175.5 71.8 180.4 72.7 187.8 73.1 194.7 69.4 187.3 67.8 182 64.9 176.7 64.9 172.2 64.1 166.9 64.1 162.4 64.5 158.4',
  },
  // Calves (Anterior lateral)
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'anterior',
    points: '24.9 194.7 27.8 164.9 28.2 160.4 26.1 154.3 24.9 157.6 22.4 161.6 20.8 167.8 22 188.2 20.8 195.5',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'anterior',
    points: '75.1 194.7 72.2 164.9 71.8 160.4 73.9 154.3 75.1 157.6 77.6 161.6 79.2 167.8 78 188.2 79.2 195.5',
  },
  // Ankles / Feet (Inert)
  {
    id: 'feet',
    name: 'Pies',
    isInert: true,
    view: 'anterior',
    points: '20.8 195.5 26.9 194.7 28.5 204 18 204',
  },
  {
    id: 'feet',
    name: 'Pies',
    isInert: true,
    view: 'anterior',
    points: '79.2 195.5 73.1 194.7 71.5 204 82 204',
  },
];

export const POSTERIOR_PATHS: SVGPathElementData[] = [
  // Inert Head
  {
    id: 'head',
    name: 'Cabeza',
    isInert: true,
    view: 'posterior',
    points: '50.6 0 46 0.8 40.8 5.5 40.4 12.8 45.1 20 55.7 20 59.1 13.6 59.6 4.7 55.7 1.3',
  },
  // Trapezius (Posterior upper & middle)
  {
    id: 'trapezius',
    name: 'Trapecio',
    view: 'posterior',
    points: '44.7 21.7 47.7 21.7 47.2 38.3 47.7 64.7 38.3 53.2 35.3 40.8 31.1 36.6 39.1 33.2 43.8 27.2',
  },
  {
    id: 'trapezius',
    name: 'Trapecio',
    view: 'posterior',
    points: '52.3 21.7 55.7 21.7 56.6 27.2 60.8 32.8 68.9 36.6 64.7 40.4 61.7 53.2 52.3 64.7 53.2 38.3',
  },
  // Rear Deltoids
  {
    id: 'deltoids',
    name: 'Hombros',
    view: 'posterior',
    points: '29.4 37 23 39.1 17.4 44.2 18.3 53.6 24.2 49.4 27.2 46.4',
  },
  {
    id: 'deltoids',
    name: 'Hombros',
    view: 'posterior',
    points: '71.1 37 78.3 39.6 82.5 44.7 81.7 53.6 74.9 48.9 72.3 45.1',
  },
  // Upper Back / Lats / Rhomboids
  {
    id: 'upper-back',
    name: 'Espalda alta',
    view: 'posterior',
    points: '31.1 38.7 28.1 48.9 28.5 55.3 34 75.3 47.2 71.1 47.2 66.4 36.6 54 33.6 41.3',
  },
  {
    id: 'upper-back',
    name: 'Espalda alta',
    view: 'posterior',
    points: '68.9 38.7 71.9 49.4 71.5 56.2 66 75.3 52.8 71.1 52.8 66.4 63.4 54.5 66.4 41.7',
  },
  // Triceps
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'posterior',
    points: '26.8 49.8 17.9 55.7 14.5 72.3 16.6 81.7 21.7 63.8 26.8 55.7',
  },
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'posterior',
    points: '26.8 58.3 26.8 68.5 23 75.3 19.1 77.4 22.5 65.5',
  },
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'posterior',
    points: '73.6 50.2 82.1 55.7 86 73.2 83.4 82.1 77.9 63 73.2 55.7',
  },
  {
    id: 'triceps',
    name: 'Tríceps',
    view: 'posterior',
    points: '72.8 58.3 77 64.7 80.4 77.4 76.6 75.3 72.8 68.9',
  },
  // Lower Back / Erector Spinae
  {
    id: 'lower-back',
    name: 'Espalda baja',
    view: 'posterior',
    points: '47.7 72.8 34.5 77 35.3 83.4 49.4 102.1 46.8 83',
  },
  {
    id: 'lower-back',
    name: 'Espalda baja',
    view: 'posterior',
    points: '52.3 72.8 65.5 77 64.7 83.4 50.6 102.1 53.2 83.8',
  },
  // Forearms (Posterior)
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'posterior',
    points: '13.6 75.7 8.9 83.8 6.8 93.6 0 106.4 3.8 104.2 12.3 88.5 15.7 83',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'posterior',
    points: '18.7 79.6 22.1 77.9 20.8 84.2 9.4 103 6.8 108.5 5.1 104.7',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'posterior',
    points: '86.4 75.7 91.1 83.4 93.2 94 100 106.4 96.2 104.2 88.1 89.4 84.3 83.8',
  },
  {
    id: 'forearm',
    name: 'Antebrazos',
    view: 'posterior',
    points: '81.3 79.6 77.4 77.9 79.1 84.7 91.1 103.8 93.2 108.9 94.5 104.7',
  },
  // Hands (Inert)
  {
    id: 'hands',
    name: 'Manos',
    isInert: true,
    view: 'posterior',
    points: '0 106.4 3.8 104.2 6.8 108.5 4 116 0 112',
  },
  {
    id: 'hands',
    name: 'Manos',
    isInert: true,
    view: 'posterior',
    points: '100 106.4 96.2 104.2 93.2 108.9 96 116 100 112',
  },
  // Gluteal
  {
    id: 'gluteal',
    name: 'Glúteos',
    view: 'posterior',
    points: '44.7 99.6 30.2 108.5 29.8 118.7 31.5 126 47.2 121.3 49.4 114.9',
  },
  {
    id: 'gluteal',
    name: 'Glúteos',
    view: 'posterior',
    points: '55.3 99.1 51.1 114.5 52.3 120.9 68.1 126 69.8 119.1 69.4 108.5',
  },
  // Adductors (Posterior inner)
  {
    id: 'adductors',
    name: 'Aductores',
    view: 'posterior',
    points: '48.1 123 44.7 123 41.3 125.5 45.1 144.3 48.5 135.7 48.9 129.4',
  },
  {
    id: 'adductors',
    name: 'Aductores',
    view: 'posterior',
    points: '51.9 122.6 55.7 123.4 59.1 126 54.9 144.3 51.9 136.2 51.1 129.4',
  },
  // Hamstrings
  {
    id: 'hamstring',
    name: 'Isquiotibiales',
    view: 'posterior',
    points: '28.9 122.1 31.1 129.4 36.6 126 35.3 135.3 34.5 150.2 29.4 158.3 28.9 146.8 27.7 141.3 27.2 131.5',
  },
  {
    id: 'hamstring',
    name: 'Isquiotibiales',
    view: 'posterior',
    points: '38.7 125.5 44.3 146 40.4 166.8 36.2 152.8 37 135.3',
  },
  {
    id: 'hamstring',
    name: 'Isquiotibiales',
    view: 'posterior',
    points: '71.5 121.7 69.4 128.9 63.8 126 65.5 136.6 66.4 150.2 71.1 158.3 71.5 147.7 72.8 142.1 73.6 131.9',
  },
  {
    id: 'hamstring',
    name: 'Isquiotibiales',
    view: 'posterior',
    points: '61.7 125.5 63.4 136.2 64.3 153.2 60 166.8 56.2 146.4',
  },
  // Knees (Posterior / Popliteal fossa)
  {
    id: 'knees',
    name: 'Rodillas',
    isInert: true,
    view: 'posterior',
    points: '34.5 153.2 31.1 159.1 33.6 166.4 37.4 162.6',
  },
  {
    id: 'knees',
    name: 'Rodillas',
    isInert: true,
    view: 'posterior',
    points: '66.4 153.6 63 163 66.8 166.4 69.4 159.1',
  },
  // Calves (Gastrocnemius & Soleus)
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '29.4 160.4 28.5 167.2 24.7 179.6 23.8 192.8 25.5 197 28.5 193.2 29.8 180 31.9 171.1 31.9 166.8',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '37.4 165.1 35.3 167.7 33.2 171.9 31.1 180.4 30.2 191.9 34 200 38.7 190.6 39.1 168.9',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '63 165.1 61.3 168.5 61.7 190.6 66.4 199.6 70.6 191.9 68.9 179.6 66.8 170.2',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '70.6 160.4 72.3 168.5 75.7 179.1 76.6 192.8 74.5 196.6 72.3 193.6 70.6 179.6 68.1 168.1',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '28.5 195.7 30.2 195.7 33.6 201.7 30.6 208 28.5 204 26.8 198.3',
  },
  {
    id: 'calves',
    name: 'Gemelos',
    view: 'posterior',
    points: '69.8 195.7 71.9 195.7 73.6 198.3 71.9 204 70.2 208 67.2 202.1',
  },
  // Feet (Inert)
  {
    id: 'feet',
    name: 'Pies',
    isInert: true,
    view: 'posterior',
    points: '26.8 204 30.6 208 31 214 24 214',
  },
  {
    id: 'feet',
    name: 'Pies',
    isInert: true,
    view: 'posterior',
    points: '71.9 204 70.2 208 69 214 76 214',
  },
];
