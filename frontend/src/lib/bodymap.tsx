/**
 * Body map: renders react-body-highlighter models (front + back) into a
 * container, highlighting the muscle groups worked today.
 */
import { createRoot } from 'react-dom/client';
import Model, { type Muscle } from 'react-body-highlighter';

// Dataset muscle_group → react-body-highlighter slugs.
const MUSCLE_MAP: Record<string, Muscle[]> = {
  abdominals: ['abs'],
  'ankle stabilizers': ['calves'],
  ankles: ['calves'],
  biceps: ['biceps'],
  calves: ['calves'],
  chest: ['chest'],
  core: ['abs', 'obliques'],
  deltoids: ['front-deltoids', 'back-deltoids'],
  forearms: ['forearm'],
  glutes: ['gluteal'],
  hamstrings: ['hamstring'],
  hands: ['forearm'],
  'hip flexors': ['abs', 'quadriceps'],
  'latissimus dorsi': ['upper-back'],
  lats: ['upper-back'],
  'lower back': ['lower-back'],
  obliques: ['obliques'],
  quadriceps: ['quadriceps'],
  rhomboids: ['upper-back'],
  'rotator cuff': ['back-deltoids'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  soleus: ['calves'],
  trapezius: ['trapezius'],
  traps: ['trapezius'],
  triceps: ['triceps'],
  'upper back': ['upper-back'],
  'wrist extensors': ['forearm'],
  'wrist flexors': ['forearm'],
  wrists: ['forearm'],
};

export function toModelMuscles(muscleGroups: string[]): Muscle[] {
  const out = new Set<Muscle>();
  for (const g of muscleGroups) {
    for (const m of MUSCLE_MAP[String(g || '').toLowerCase()] ?? []) out.add(m);
  }
  return [...out];
}

export function renderBodyMap(container: HTMLElement, muscleGroups: string[]): void {
  const data = [{ name: 'hoy', muscles: toModelMuscles(muscleGroups) }];
  // Realistic skin tone on a dark card, with a vibrant accent for worked muscles.
  const props = { data, bodyColor: '#d4a373', highlightedColors: ['#3b82f6'] };
  createRoot(container).render(
    <div>
      <div className="bodymap">
        <Model {...props} type="anterior" />
        <Model {...props} type="posterior" />
      </div>
      <div className="bodymap-labels">
        <span>Frente</span>
        <span>Espalda</span>
      </div>
    </div>,
  );
}
