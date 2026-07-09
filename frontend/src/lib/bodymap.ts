/**
 * Body map: renders body-highlighter models (front + back) into a container,
 * highlighting the muscle groups worked today.
 */
import createBodyHighlighter from 'body-highlighter';

// Dataset muscle_group → body-highlighter slugs.
const MUSCLE_MAP: Record<string, string[]> = {
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

function toModelMuscles(muscleGroups: string[]): string[] {
  const modelMuscles = new Set<string>();
  for (const group of muscleGroups) {
    for (const muscle of MUSCLE_MAP[String(group || '').toLowerCase()] ?? []) modelMuscles.add(muscle);
  }
  return [...modelMuscles];
}

export function renderBodyMap(container: HTMLElement, muscleGroups: string[]): void {
  const data = [{ name: 'hoy', muscles: toModelMuscles(muscleGroups) as any }];
  // Realistic skin tone on a light card, with the app accent for worked muscles.
  const options = { data, bodyColor: '#e3b58c', highlightedColors: ['#4f46e5'] };
  container.innerHTML =
    '<div class="bodymap"><div data-side="anterior"></div><div data-side="posterior"></div></div>' +
    '<div class="bodymap-labels"><span>Frente</span><span>Espalda</span></div>';
  for (const side of ['anterior', 'posterior'] as const) {
    createBodyHighlighter({
      ...options,
      container: container.querySelector<HTMLElement>(`[data-side="${side}"]`)!,
      type: side,
    });
  }
}
