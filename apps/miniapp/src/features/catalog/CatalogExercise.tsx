/** Catalog detail: demonstration, muscles and technique — no logging. */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatEquipment, formatMuscle, mediaUrl, sessionMuscles } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { BodyMap } from '../../components/visualizations';

export function CatalogExercise({ exerciseId }: { exerciseId: number }) {
  const app = useApp();
  const exerciseQuery = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}`),
  });
  const exercise = exerciseQuery.data;

  if (exerciseQuery.isLoading) return <Loading />;
  if (!exercise)
    return (
      <>
        <TopBar title="Ejercicio" onBack={app.pop} />
        <Empty icon="⚠️">Ejercicio no encontrado.</Empty>
      </>
    );

  const mediaSrc = mediaUrl(exercise.gif_url || exercise.image_url);
  const muscles = sessionMuscles([exercise]);
  const instructions = exercise.instructions_es || exercise.instructions;

  return (
    <>
      <TopBar title="Catálogo" onBack={app.pop} />
      <div class="my-3 overflow-hidden rounded-card bg-surface shadow-card min-[720px]:grid min-[720px]:grid-cols-[1.12fr_.88fr]">
        <div class="grid h-[235px] place-items-center bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] min-[720px]:h-auto min-[720px]:min-h-[280px]">
          {mediaSrc ? <img class="size-[180px] object-contain" src={mediaSrc} alt={exercise.name} loading="eager" width="180" height="180" /> : '🏋️'}
        </div>
        <div class="p-[18px] min-[720px]:flex min-[720px]:flex-col min-[720px]:justify-center">
          <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">{formatMuscle(exercise.body_part)}</p>
          <h1>{exercise.name}</h1>
          <p>
            {formatMuscle(exercise.target || exercise.muscle_group)}
            {exercise.equipment ? ` · ${formatEquipment(exercise.equipment)}` : ''}
          </p>
        </div>
      </div>
      {instructions && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Técnica</h3>
          <p class="mt-2 whitespace-pre-line">{instructions}</p>
        </div>
      )}
      {muscles.length > 0 && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Músculos trabajados</h3>
          <BodyMap muscles={muscles} />
        </div>
      )}
    </>
  );
}
