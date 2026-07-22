/** Catalog detail: demonstration, muscles and technique — no logging. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatEquipment, formatMuscle, mediaUrl, sessionMuscles, showToast } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { BodyMap } from '../../components/visualizations';

export function CatalogExercise({ exerciseId }: { exerciseId: number }) {
  const app = useApp();
  const queryClient = useQueryClient();
  const exerciseQuery = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => apiFetch('GET', `/exercises/${exerciseId}`),
  });
  const dislikedQuery = useQuery({
    queryKey: ['disliked-exercises'],
    queryFn: () => apiFetch('GET', '/disliked-exercises'),
  });
  const isDisliked = ((dislikedQuery.data as any[]) || []).some(
    (exercise) => exercise.exercise_id === exerciseId,
  );
  const preferenceMutation = useMutation({
    mutationFn: () =>
      isDisliked
        ? apiFetch('DELETE', `/disliked-exercises/${exerciseId}`)
        : apiFetch('POST', '/disliked-exercises', { exercise_id: exerciseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disliked-exercises'] });
      showToast(isDisliked ? 'Eliminado de no me gusta' : 'Marcado como no me gusta');
    },
    onError: () => showToast('No pude cambiar la preferencia', 'err'),
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
      {!app.readOnly && (
        <button
          class={`min-h-[50px] w-full cursor-pointer rounded-2xl border-0 px-[17px] py-[13px] text-[.94rem] font-[720] transition active:scale-[.975] disabled:pointer-events-none disabled:opacity-35 ${isDisliked ? 'bg-surface text-err shadow-[inset_0_0_0_1px_var(--color-edge)]' : 'bg-err/10 text-err'}`}
          disabled={dislikedQuery.isLoading || preferenceMutation.isPending}
          onClick={() => preferenceMutation.mutate()}
        >
          {isDisliked ? 'Quitar de no me gusta' : '👎 No me gusta'}
        </button>
      )}
      {(instructions || muscles.length > 0) && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h3>Sobre el ejercicio</h3>
          {instructions && (
            <details class="mt-2 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
              <summary>Técnica</summary>
              <p class="whitespace-pre-line">{instructions}</p>
            </details>
          )}
          {muscles.length > 0 && (
            <details class="mt-1 border-t border-edge pt-2 [&[open]>summary]:mb-2.5">
              <summary>Músculos trabajados</summary>
              <BodyMap muscles={muscles} />
            </details>
          )}
        </div>
      )}
    </>
  );
}
