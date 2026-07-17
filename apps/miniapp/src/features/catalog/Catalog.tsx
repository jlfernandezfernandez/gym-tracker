/** Catalog: browse the full exercise library with search, filter and pagination. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { formatEquipment, formatMuscle, mediaUrl } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';

const DISLIKED_KEY = '__disliked__';

export function Catalog() {
  const app = useApp();
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

  const bodyParts: string[] = facetsQuery.data?.body_parts || [];
  const dislikedExercises: any[] = (dislikedQuery.data as any[]) || [];
  const visibleExercises = showDisliked
    ? dislikedExercises.map(({ exercise_id, ...exercise }) => ({ ...exercise, id: exercise_id }))
    : exercises;
  const isLoading = showDisliked ? dislikedQuery.isLoading : listQuery.isLoading;

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
      {isLoading ? (
        <Loading />
      ) : !visibleExercises.length ? (
        <Empty icon={showDisliked ? '👍' : '🔍'}>
          {showDisliked ? 'No tienes ejercicios marcados como "no me gusta".' : 'Nada con ese filtro. Prueba otro nombre.'}
        </Empty>
      ) : (
        <div class="mt-3 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
          {visibleExercises.map((exercise) => (
            <button
              key={exercise.id}
              class="grid min-h-[68px] w-full cursor-pointer grid-cols-[52px_1fr_auto] items-center gap-3 border-0 border-b border-edge bg-transparent px-[15px] py-2.5 text-left last:border-b-0"
              onClick={() => app.push({ name: 'catalogExercise', exerciseId: exercise.id })}
            >
              <span class="grid size-[52px] place-items-center overflow-hidden rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                {exercise.image_url ? <img src={mediaUrl(exercise.image_url)} alt="" loading="lazy" class="size-full object-contain" /> : '🏋️'}
              </span>
              <span class="min-w-0">
                <b class="block overflow-hidden text-[.88rem] text-ellipsis whitespace-nowrap text-ink">{exercise.name}</b>
                <small class="mt-[2px] block text-[.72rem] text-hint">
                  {formatMuscle(exercise.target || exercise.muscle_group)}
                  {exercise.equipment ? ` · ${formatEquipment(exercise.equipment)}` : ''}
                </small>
              </span>
              <span class="text-[1.4rem] text-divider">›</span>
            </button>
          ))}
        </div>
      )}
      {!showDisliked && <div ref={sentinelRef} />}
      {listQuery.isFetchingNextPage && <p class="my-3 text-center text-xs">Cargando más...</p>}
    </>
  );
}
