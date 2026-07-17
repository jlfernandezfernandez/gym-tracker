/** Catalog: browse the full exercise library with search, filter and pagination. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { formatEquipment, formatMuscle, mediaUrl, showToast } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';

const DISLIKED_KEY = '__disliked__';

export function Catalog() {
  const app = useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const showDisliked = bodyPart === DISLIKED_KEY;

  const facetsQuery = useQuery({
    queryKey: ['exercise-facets'],
    queryFn: () => apiFetch('GET', '/exercises/facets'),
    staleTime: Infinity,
  });

  const dislikedQuery = useQuery({
    queryKey: ['disliked-exercises'],
    queryFn: () => apiFetch('GET', '/disliked-exercises'),
    enabled: showDisliked,
  });

  const PAGE_SIZE = 50;
  const listQuery = useInfiniteQuery({
    queryKey: ['catalog', search, bodyPart],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (search) params.set('search', search);
      if (bodyPart && bodyPart !== DISLIKED_KEY) params.set('body_part', bodyPart);
      return apiFetch('GET', `/exercises?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any[], pages: any[][]) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    placeholderData: (previous: any) => previous,
    enabled: !showDisliked,
  });
  const exercises: any[] = listQuery.data?.pages.flat() || [];

  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNextRef = useRef<() => void>(() => {});
  fetchNextRef.current = () => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) listQuery.fetchNextPage();
  };
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && fetchNextRef.current(),
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const dislikeMutation = useMutation({
    mutationFn: (exerciseId: number) => apiFetch('POST', '/disliked-exercises', { exercise_id: exerciseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disliked-exercises'] });
      showToast('Marcado como no me gusta');
    },
    onError: () => showToast('Error al marcar', 'err'),
  });

  const undislikeMutation = useMutation({
    mutationFn: (exerciseId: number) => apiFetch('DELETE', `/disliked-exercises/${exerciseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disliked-exercises'] });
      showToast('Eliminado de no me gusta');
    },
    onError: () => showToast('Error al eliminar', 'err'),
  });

  const bodyParts: string[] = facetsQuery.data?.body_parts || [];
  const dislikedExercises: any[] = (dislikedQuery.data as any[]) || [];

  return (
    <>
      <TopBar title="Ejercicios" subtitle="Catálogo completo del coach" />
      {!showDisliked && (
        <input
          type="search"
          inputmode="search"
          enterkeyhint="search"
          placeholder="Buscar ejercicio..."
          aria-label="Buscar ejercicio"
          class="!text-left"
          value={search}
          onInput={(event: any) => setSearch(event.target.value)}
        />
      )}
      <div class="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {['', ...bodyParts, DISLIKED_KEY].map((part) => (
          <button
            key={part}
            class={`shrink-0 cursor-pointer rounded-pill border-0 px-3 py-2 text-[.78rem] font-[650] transition active:scale-95 ${bodyPart === part ? 'bg-ink text-canvas' : 'bg-surface text-hint shadow-[inset_0_0_0_1px_var(--color-edge)]'}`}
            onClick={() => setBodyPart(part)}
          >
            {part === DISLIKED_KEY ? 'No me gusta' : part ? formatMuscle(part) : 'Todos'}
          </button>
        ))}
      </div>
      {showDisliked ? (
        dislikedQuery.isLoading ? (
          <Loading />
        ) : !dislikedExercises.length ? (
          <Empty icon="👍">No tienes ejercicios marcados como "no me gusta".</Empty>
        ) : (
          <div class="mt-3 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
            {dislikedExercises.map((exercise) => (
              <div
                key={exercise.exercise_id}
                class="grid min-h-[68px] w-full grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-edge px-[15px] py-2.5 last:border-b-0"
              >
                <span class="grid size-[52px] place-items-center overflow-hidden rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                  {exercise.image_url ? <img src={mediaUrl(exercise.image_url)} alt="" loading="lazy" class="size-full object-contain" /> : '🏋️'}
                </span>
                <span class="min-w-0">
                  <b class="block overflow-hidden text-[.88rem] text-ellipsis whitespace-nowrap">{exercise.name}</b>
                  <small class="mt-[2px] block text-[.72rem] text-hint">{formatMuscle(exercise.muscle_group)}{exercise.equipment ? ` · ${formatEquipment(exercise.equipment)}` : ''}</small>
                </span>
                <button
                  class="shrink-0 cursor-pointer rounded-pill border-0 bg-err/10 px-3 py-1.5 text-[.72rem] font-[650] text-err transition active:scale-95"
                  onClick={() => undislikeMutation.mutate(exercise.exercise_id)}
                  disabled={undislikeMutation.isPending}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )
      ) : listQuery.isLoading ? (
        <Loading />
      ) : !exercises.length ? (
        <Empty icon="🔍">Nada con ese filtro. Prueba otro nombre.</Empty>
      ) : (
        <div class="mt-3 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
          {exercises.map((exercise) => (
            <div
              key={exercise.id}
              class="grid min-h-[68px] w-full grid-cols-[52px_1fr_auto_auto] items-center gap-3 border-b border-edge px-[15px] py-2.5 last:border-b-0"
            >
              <button
                class="col-span-1 cursor-pointer border-0 bg-transparent p-0"
                onClick={() => app.push({ name: 'catalogExercise', exerciseId: exercise.id })}
              >
                <span class="grid size-[52px] place-items-center overflow-hidden rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                  {exercise.image_url ? <img src={mediaUrl(exercise.image_url)} alt="" loading="lazy" class="size-full object-contain" /> : '🏋️'}
                </span>
              </button>
              <button
                class="col-span-1 min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left"
                onClick={() => app.push({ name: 'catalogExercise', exerciseId: exercise.id })}
              >
                <b class="block overflow-hidden text-[.88rem] text-ellipsis whitespace-nowrap text-ink">{exercise.name}</b>
                <small class="mt-[2px] block text-[.72rem] text-hint">{formatMuscle(exercise.target || exercise.muscle_group)}{exercise.equipment ? ` · ${formatEquipment(exercise.equipment)}` : ''}</small>
              </button>
              <button
                class="shrink-0 cursor-pointer rounded-pill border-0 bg-err/10 px-2.5 py-1.5 text-[.72rem] font-[650] text-err transition active:scale-95"
                onClick={() => dislikeMutation.mutate(exercise.id)}
                disabled={dislikeMutation.isPending}
                aria-label={`Marcar ${exercise.name} como no me gusta`}
              >
                👎
              </button>
              <span class="text-[1.4rem] text-divider">›</span>
            </div>
          ))}
        </div>
      )}
      {!showDisliked && <div ref={sentinelRef} />}
      {listQuery.isFetchingNextPage && <p class="my-3 text-center text-xs">Cargando más...</p>}
    </>
  );
}
