/** Catalog: browse the full exercise library with search, filter and pagination. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { formatEquipment, formatMuscle, mediaUrl } from '../../lib/helpers';
import { useApp } from '../../app/App';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { BodyMap } from '../../components/visualizations';
import { formatMuscleName, normalizeMuscle } from '../../lib/body-paths';

const MUSCLE_TO_BODYPART: Record<string, string> = {
  chest: 'chest',
  deltoids: 'shoulders',
  'upper-back': 'back',
  'lower-back': 'back',
  trapezius: 'back',
  biceps: 'upper arms',
  triceps: 'upper arms',
  forearm: 'lower arms',
  abs: 'waist',
  obliques: 'waist',
  serratus: 'waist',
  quadriceps: 'upper legs',
  hamstring: 'upper legs',
  gluteal: 'upper legs',
  adductors: 'upper legs',
  'hip-flexors': 'waist',
  calves: 'lower legs',
  tibialis: 'lower legs',
};

export function Catalog() {
  const app = useApp();
  const [search, setSearch] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [showBodyMap, setShowBodyMap] = useState(false);

  const facetsQuery = useQuery({
    queryKey: ['exercise-facets'],
    queryFn: () => apiFetch('GET', '/exercises/facets'),
    staleTime: Infinity,
  });

  const recoveryQuery = useQuery({
    queryKey: ['recovery'],
    queryFn: () => apiFetch<any>('GET', '/coach/recovery'),
    enabled: !app.readOnly,
  });

  const handleSelectMuscle = (muscleSlug: string | null) => {
    if (!muscleSlug) {
      setSelectedMuscle(null);
      setBodyPart('');
      return;
    }
    const norm = normalizeMuscle(muscleSlug);
    setSelectedMuscle(norm);
    const mappedBodyPart = norm ? MUSCLE_TO_BODYPART[norm] : '';
    if (mappedBodyPart) {
      setBodyPart(mappedBodyPart);
    }
  };

  const handleSelectBodyPart = (part: string) => {
    setBodyPart(part);
    if (!part) {
      setSelectedMuscle(null);
    } else {
      // Find matching canonical muscle if any
      const matchingMuscle = Object.entries(MUSCLE_TO_BODYPART).find(([, bp]) => bp === part)?.[0];
      if (matchingMuscle && selectedMuscle && MUSCLE_TO_BODYPART[selectedMuscle] !== part) {
        setSelectedMuscle(matchingMuscle);
      }
    }
  };

  const PAGE_SIZE = 50;
  const listQuery = useInfiniteQuery({
    queryKey: ['catalog', search, bodyPart, selectedMuscle],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (search) params.set('search', search);
      if (bodyPart) params.set('body_part', bodyPart);
      return apiFetch('GET', `/exercises?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any[], pages: any[][]) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    placeholderData: (previous: any) => previous,
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

  const bodyParts: string[] = ['', ...(facetsQuery.data?.body_parts || [])];

  return (
    <>
      <TopBar title="Ejercicios" subtitle="Catálogo completo del coach" />
      <div class="flex gap-2">
        <input
          type="search"
          inputmode="search"
          enterkeyhint="search"
          placeholder="Buscar ejercicio..."
          aria-label="Buscar ejercicio"
          class="!text-left flex-1"
          value={search}
          onInput={(event: any) => setSearch(event.target.value)}
        />
        <button
          type="button"
          class={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border-0 px-3.5 py-2 text-xs font-bold transition active:scale-95 ${
            showBodyMap || selectedMuscle
              ? 'bg-accent text-white'
              : 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]'
          }`}
          onClick={() => setShowBodyMap(!showBodyMap)}
          aria-label="Alternar mapa muscular"
        >
          <span>🗺️</span>
          <span class="hidden min-[400px]:inline">Mapa</span>
        </button>
      </div>

      {/* Interactive BodyMap Tap-to-Filter Drawer */}
      {showBodyMap && (
        <div class="my-3 overflow-hidden rounded-card bg-surface p-3 shadow-card transition-all">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-bold text-hint uppercase tracking-wider">
              Toca un músculo para filtrar
            </span>
            {selectedMuscle && (
              <button
                type="button"
                class="cursor-pointer text-xs font-bold text-accent hover:underline"
                onClick={() => handleSelectMuscle(null)}
              >
                Limpiar selección
              </button>
            )}
          </div>
          <BodyMap
            mode="fatigue"
            recoveryData={recoveryQuery.data?.muscles}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={handleSelectMuscle}
            showPopover={true}
            showLegend={true}
            interactive={true}
          />
        </div>
      )}

      {/* Active Filter Pill */}
      {selectedMuscle && !showBodyMap && (
        <div class="mt-2.5 flex items-center gap-2">
          <span class="flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
            <span>Músculo: {formatMuscleName(selectedMuscle)}</span>
            <button
              type="button"
              class="cursor-pointer font-bold text-accent hover:opacity-75"
              onClick={() => handleSelectMuscle(null)}
              aria-label="Quitar filtro de músculo"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {/* Horizontal Body Part Chips */}
      <div class="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {bodyParts.map((part) => (
          <button
            key={part}
            class={`shrink-0 cursor-pointer rounded-pill border-0 px-3 py-2 text-[.78rem] font-[650] transition active:scale-95 ${
              bodyPart === part
                ? 'bg-ink text-canvas'
                : 'bg-surface text-hint shadow-[inset_0_0_0_1px_var(--color-edge)]'
            }`}
            onClick={() => handleSelectBodyPart(part)}
          >
            {part ? formatMuscle(part) : 'Todos'}
          </button>
        ))}
      </div>

      {listQuery.isLoading ? (
        <Loading />
      ) : !exercises.length ? (
        <Empty icon="🔍">Nada con ese filtro. Prueba otro nombre o músculo.</Empty>
      ) : (
        <div class="mt-3 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
          {exercises.map((exercise) => (
            <button
              key={exercise.id}
              class="grid min-h-[68px] w-full cursor-pointer grid-cols-[52px_1fr_auto] items-center gap-3 border-0 border-b border-edge bg-transparent px-[15px] py-2.5 text-left transition-colors duration-150 hover:bg-hover active:bg-hover last:border-b-0"
              onClick={() => app.push({ name: 'catalogExercise', exerciseId: exercise.id })}
            >
              <span class="grid size-[52px] place-items-center overflow-hidden rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]">
                {exercise.image_url ? (
                  <img src={mediaUrl(exercise.image_url)} alt="" loading="lazy" class="size-full object-contain" />
                ) : (
                  '🏋️'
                )}
              </span>
              <span class="min-w-0">
                <b class="block overflow-hidden text-[.88rem] text-ellipsis whitespace-nowrap text-ink">
                  {exercise.name}
                </b>
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
      <div ref={sentinelRef} />
      {listQuery.isFetchingNextPage && <p class="my-3 text-center text-xs">Cargando más...</p>}
    </>
  );
}
