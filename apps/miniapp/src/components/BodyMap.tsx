/**
 * Interactive 3-Mode Body Muscle Map Component.
 * Supports:
 *  - Mode 1: Fatigue / Recovery (36h decay: Green >=75%, Amber 45%-74%, Red <45%)
 *  - Mode 2: Balance / Volume (0-4 load shading tiers)
 *  - Mode 3: Strength / Records (1RM PR highlights)
 *  - Interactive muscle tapping, popover details, and dark/light Telegram Webview theme.
 */

import { useMemo, useState } from 'preact/hooks';
import {
  type CanonicalMuscle,
  type BodyPartId,
  ANTERIOR_PATHS,
  POSTERIOR_PATHS,
  MUSCLE_LABELS_ES,
  formatMuscleName,
  normalizeMuscle,
} from '../lib/body-paths';
import {
  type BodyMapMode,
  type MuscleRecoveryInfo,
  resolvePartColor,
  normalizeRecoveryData,
  normalizeVolumeData,
  COLOR_READY,
  COLOR_RECOVERING,
  COLOR_FATIGUED,
  VOLUME_TIER_COLORS,
} from '../lib/bodymap';

export interface BodyMapProps {
  mode?: BodyMapMode;
  muscles?: string[];
  recoveryData?: Record<string, MuscleRecoveryInfo> | MuscleRecoveryInfo[] | null;
  volumeData?: Record<string, number> | null;
  selectedMuscle?: string | null;
  onSelectMuscle?: (muscleSlug: string | null) => void;
  className?: string;
  interactive?: boolean;
  showModeSelector?: boolean;
  showLegend?: boolean;
  showPopover?: boolean;
}

export function BodyMap({
  mode: initialMode = 'fatigue',
  muscles,
  recoveryData,
  volumeData,
  selectedMuscle: controlledSelected,
  onSelectMuscle,
  className = '',
  interactive = true,
  showModeSelector = false,
  showLegend = false,
  showPopover = true,
}: BodyMapProps) {
  // If simple 'muscles' array passed without explicit mode choice, default to simple highlight
  const isSimpleHighlight = Boolean(muscles && muscles.length > 0 && !recoveryData && !volumeData);
  const [activeMode, setActiveMode] = useState<BodyMapMode>(initialMode);
  const [internalSelected, setInternalSelected] = useState<CanonicalMuscle | null>(null);

  const selectedMuscleSlug = controlledSelected !== undefined
    ? normalizeMuscle(controlledSelected)
    : internalSelected;

  const currentMode: BodyMapMode = isSimpleHighlight ? 'balance' : activeMode;

  // Normalized data maps
  const highlightedSet = useMemo(() => {
    const set = new Set<CanonicalMuscle>();
    if (muscles) {
      for (const m of muscles) {
        const norm = normalizeMuscle(m);
        if (norm) set.add(norm);
      }
    }
    return set;
  }, [muscles]);

  const recoveryMap = useMemo(() => normalizeRecoveryData(recoveryData), [recoveryData]);
  const { map: volumeMap, max: maxVolume } = useMemo(() => normalizeVolumeData(volumeData), [volumeData]);

  const handleMuscleClick = (partId: BodyPartId, isInert?: boolean) => {
    if (!interactive || isInert) return;
    const muscle = partId as CanonicalMuscle;
    const isAlreadySelected = selectedMuscleSlug === muscle;
    const nextSelection = isAlreadySelected ? null : muscle;

    if (controlledSelected === undefined) {
      setInternalSelected(nextSelection);
    }
    onSelectMuscle?.(nextSelection);
  };

  // Selected muscle details for Popover / Info Card
  const selectedInfo = useMemo(() => {
    if (!selectedMuscleSlug) return null;
    const label = MUSCLE_LABELS_ES[selectedMuscleSlug] || formatMuscleName(selectedMuscleSlug);
    const rec = recoveryMap.get(selectedMuscleSlug);
    const vol = volumeMap.get(selectedMuscleSlug) || 0;

    return {
      slug: selectedMuscleSlug,
      label,
      recovery: rec,
      volume: vol,
    };
  }, [selectedMuscleSlug, recoveryMap, volumeMap]);

  return (
    <div class={`flex flex-col items-center select-none ${className}`}>
      {/* Mode Selector (Optional) */}
      {showModeSelector && (
        <div class="mb-3 flex w-full max-w-[260px] rounded-pill bg-surface-2 p-1 text-xs font-semibold shadow-inner">
          <button
            type="button"
            class={`flex-1 rounded-pill py-1.5 transition ${
              activeMode === 'fatigue' ? 'bg-surface text-ink shadow-sm' : 'text-hint hover:text-ink'
            }`}
            onClick={() => setActiveMode('fatigue')}
          >
            Recuperación
          </button>
          <button
            type="button"
            class={`flex-1 rounded-pill py-1.5 transition ${
              activeMode === 'balance' ? 'bg-surface text-ink shadow-sm' : 'text-hint hover:text-ink'
            }`}
            onClick={() => setActiveMode('balance')}
          >
            Volumen
          </button>
        </div>
      )}

      {/* SVG Figures Container */}
      <div class="flex items-end justify-center gap-6 py-2">
        {/* Anterior View (Front) */}
        <div class="flex flex-col items-center">
          <svg
            viewBox="0 0 100 210"
            class="h-auto w-[125px] touch-manipulation drop-shadow-sm sm:w-[140px]"
            aria-label="Vista frontal"
            role="img"
          >
            {ANTERIOR_PATHS.map((item, idx) => {
              const colorState = resolvePartColor({
                partId: item.id,
                isInert: item.isInert,
                mode: currentMode,
                highlightedMuscles: highlightedSet,
                recoveryMap,
                volumeMap,
                maxVolume,
              });

              const isSelected = selectedMuscleSlug === item.id;
              const isClickable = interactive && !item.isInert;

              return (
                <polygon
                  key={`ant-${item.id}-${idx}`}
                  points={item.points}
                  fill={colorState.fill}
                  stroke={isSelected ? 'var(--color-ink, #ffffff)' : 'var(--color-surface, #1c1c1e)'}
                  strokeWidth={isSelected ? '2.5' : '1.4'}
                  strokeLinejoin="round"
                  class={`transition-all duration-200 ${
                    isClickable ? 'cursor-pointer hover:brightness-110 active:scale-98' : ''
                  }`}
                  onClick={() => handleMuscleClick(item.id, item.isInert)}
                  data-muscle={item.id}
                  data-selected={isSelected ? 'true' : 'false'}
                  aria-label={`${item.name}${isSelected ? ' (seleccionado)' : ''}`}
                />
              );
            })}
          </svg>
          <span class="mt-1 text-[.6rem] font-bold tracking-wider text-hint uppercase">Frente</span>
        </div>

        {/* Posterior View (Back) */}
        <div class="flex flex-col items-center">
          <svg
            viewBox="0 0 100 210"
            class="h-auto w-[120px] touch-manipulation drop-shadow-sm sm:w-[135px]"
            aria-label="Vista dorsal"
            role="img"
          >
            {POSTERIOR_PATHS.map((item, idx) => {
              const colorState = resolvePartColor({
                partId: item.id,
                isInert: item.isInert,
                mode: currentMode,
                highlightedMuscles: highlightedSet,
                recoveryMap,
                volumeMap,
                maxVolume,
              });

              const isSelected = selectedMuscleSlug === item.id;
              const isClickable = interactive && !item.isInert;

              return (
                <polygon
                  key={`post-${item.id}-${idx}`}
                  points={item.points}
                  fill={colorState.fill}
                  stroke={isSelected ? 'var(--color-ink, #ffffff)' : 'var(--color-surface, #1c1c1e)'}
                  strokeWidth={isSelected ? '2.5' : '1.4'}
                  strokeLinejoin="round"
                  class={`transition-all duration-200 ${
                    isClickable ? 'cursor-pointer hover:brightness-110 active:scale-98' : ''
                  }`}
                  onClick={() => handleMuscleClick(item.id, item.isInert)}
                  data-muscle={item.id}
                  data-selected={isSelected ? 'true' : 'false'}
                  aria-label={`${item.name}${isSelected ? ' (seleccionado)' : ''}`}
                />
              );
            })}
          </svg>
          <span class="mt-1 text-[.6rem] font-bold tracking-wider text-hint uppercase">Espalda</span>
        </div>
      </div>

      {/* Selected Muscle Interactive Popover / Tooltip Card */}
      {showPopover && selectedInfo && (
        <div class="mt-3 w-full max-w-[340px] animate-fadeIn rounded-2xl border border-edge bg-surface-2 p-3 shadow-md">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="size-2.5 rounded-full bg-accent" />
              <b class="text-sm font-bold text-ink">{selectedInfo.label}</b>
            </div>
            {interactive && (
              <button
                type="button"
                class="rounded-full p-1 text-hint transition hover:bg-hover hover:text-ink"
                onClick={() => handleMuscleClick(selectedInfo.slug as CanonicalMuscle)}
                aria-label="Cerrar detalle"
              >
                ✕
              </button>
            )}
          </div>

          <div class="mt-2 text-xs">
            {/* Fatigue / Recovery details */}
            {currentMode === 'fatigue' && (
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span class="text-hint">Estado de recuperación:</span>
                  {selectedInfo.recovery ? (
                    <span
                      class={`rounded-pill px-2 py-0.5 text-[0.7rem] font-bold ${
                        selectedInfo.recovery.status === 'ready' || selectedInfo.recovery.readiness_pct >= 75
                          ? 'bg-ok-bg text-ok'
                          : selectedInfo.recovery.status === 'recovering' || selectedInfo.recovery.readiness_pct >= 45
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-warn-bg text-warn'
                      }`}
                    >
                      {selectedInfo.recovery.status === 'ready' || selectedInfo.recovery.readiness_pct >= 75
                        ? 'Listo'
                        : selectedInfo.recovery.status === 'recovering' || selectedInfo.recovery.readiness_pct >= 45
                        ? 'Recuperando'
                        : 'Fatigado'}{' '}
                      ({selectedInfo.recovery.readiness_pct}%)
                    </span>
                  ) : (
                    <span class="rounded-pill bg-ok-bg px-2 py-0.5 text-[0.7rem] font-bold text-ok">
                      Listo (100%)
                    </span>
                  )}
                </div>
                <div class="text-[0.72rem] text-hint">
                  {selectedInfo.recovery?.last_trained_hours != null
                    ? `Entrenado hace ${Math.round(selectedInfo.recovery.last_trained_hours)}h`
                    : selectedInfo.recovery?.last_trained_date
                    ? `Último entreno: ${selectedInfo.recovery.last_trained_date}`
                    : 'Completamente descansado'}
                </div>
              </div>
            )}

            {/* Volume / Balance details */}
            {currentMode === 'balance' && (
              <div class="flex items-center justify-between">
                <span class="text-hint">Volumen acumulado:</span>
                <span class="font-bold text-ink">
                  {selectedInfo.volume > 0 ? `${selectedInfo.volume} series` : 'Sin volumen registrado'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode Legend (Optional) */}
      {showLegend && (
        <div class="mt-3 flex flex-wrap items-center justify-center gap-3 text-[0.68rem] text-hint">
          {currentMode === 'fatigue' && (
            <>
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-full" style={{ backgroundColor: COLOR_READY }} />
                Listo (≥75%)
              </span>
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-full" style={{ backgroundColor: COLOR_RECOVERING }} />
                Recuperando (45–74%)
              </span>
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-full" style={{ backgroundColor: COLOR_FATIGUED }} />
                Fatigado (&lt;45%)
              </span>
            </>
          )}
          {currentMode === 'balance' && (
            <div class="flex items-center gap-1.5">
              <span>Menor</span>
              <span class="h-2 w-3 rounded-xs" style={{ backgroundColor: VOLUME_TIER_COLORS[0] }} />
              <span class="h-2 w-3 rounded-xs" style={{ backgroundColor: VOLUME_TIER_COLORS[1] }} />
              <span class="h-2 w-3 rounded-xs" style={{ backgroundColor: VOLUME_TIER_COLORS[2] }} />
              <span class="h-2 w-3 rounded-xs" style={{ backgroundColor: VOLUME_TIER_COLORS[3] }} />
              <span class="h-2 w-3 rounded-xs" style={{ backgroundColor: VOLUME_TIER_COLORS[4] }} />
              <span>Mayor volumen</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BodyMap;
