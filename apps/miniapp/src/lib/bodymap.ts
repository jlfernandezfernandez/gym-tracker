/**
 * Body map: renders body-highlighter models (front + back) into a container,
 * highlighting the muscle groups worked today.
 */
import createBodyHighlighter from 'body-highlighter';
import { EXERCISE_TAXONOMY } from './helpers';

function toModelMuscles(muscleGroups: string[]): string[] {
  const modelMuscles = new Set<string>();
  for (const group of muscleGroups) {
    const bodyMapMuscles = EXERCISE_TAXONOMY[String(group || '').toLowerCase()]?.bodyMap ?? [];
    for (const muscle of bodyMapMuscles) modelMuscles.add(muscle);
  }
  return [...modelMuscles];
}

export function renderBodyMap(container: HTMLElement, muscleGroups: string[]): void {
  const data = [{ name: 'hoy', muscles: toModelMuscles(muscleGroups) as any }];
  // Realistic skin tone on a light card, with the app accent for worked muscles.
  const options = { data, bodyColor: '#e3b58c', highlightedColors: ['#5856d6'] };
  container.innerHTML =
    '<div class="bodymap">' +
    '<div class="bodymap-figure"><div data-side="anterior"></div><span>Frente</span></div>' +
    '<div class="bodymap-figure"><div data-side="posterior"></div><span>Espalda</span></div>' +
    '</div>';
  for (const side of ['anterior', 'posterior'] as const) {
    createBodyHighlighter({
      ...options,
      container: container.querySelector<HTMLElement>(`[data-side="${side}"]`)!,
      type: side,
    });
  }
}
