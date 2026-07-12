const tabs = [
  { name: 'landing', label: 'Hoy', path: 'M4 13h3l2-7 4 14 2-7h5' },
  { name: 'catalog', label: 'Ejercicios', path: 'M2 12h2 M20 12h2 M4 9v6 M20 9v6 M6 7v10h3V7z M15 7v10h3V7z M9 12h6' },
  { name: 'history', label: 'Historial', path: 'M4 6v5h5 M5.5 16a8 8 0 1 0-.5-9' },
  { name: 'records', label: 'Marcas', path: 'M4 18l5-6 4 3 7-9 M16 6h4v4' },
  { name: 'profile', label: 'Perfil', path: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21c0-4 3.6-6 8-6s8 2 8 6' },
] as const;

export function TopBar({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: any;
}) {
  return (
    <div class="sticky top-0 z-10 -mx-1 mb-2 flex min-h-12 items-center gap-2 rounded-[18px] bg-canvas/80 px-1 py-1 backdrop-blur-2xl backdrop-saturate-150 motion-reduce:bg-canvas">
      {onBack && (
        <button class="grid size-11 cursor-pointer place-items-center rounded-pill border-0 bg-surface text-xl text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] transition-transform duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[.94]" aria-label="Volver" onClick={onBack}>
          ←
        </button>
      )}
      <div class="min-w-0 flex-1">
        <h2 class="text-center">{title}</h2>
        {subtitle && <p class="mt-0.5 text-center text-[.7rem]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function TabBar({ active, onSelect }: { active: string; onSelect: (name: string) => void }) {
  return (
    <nav aria-label="Navegación principal" class="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-[500px] grid-cols-5 rounded-[24px] border border-white/45 bg-surface/88 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,.16)] backdrop-blur-2xl backdrop-saturate-150 motion-reduce:bg-surface">
      {tabs.map((tab) => {
        const selected = active === tab.name;
        return (
          <button
            key={tab.name}
            class={`grid min-h-[52px] cursor-pointer place-items-center content-center gap-0.5 rounded-[18px] border-0 text-[.66rem] font-[650] transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[.96] ${selected ? 'bg-accent-bg text-accent' : 'bg-transparent text-hint'}`}
            aria-current={selected ? 'page' : undefined}
            onClick={() => onSelect(tab.name)}
          >
            <svg aria-hidden="true" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d={tab.path} />
            </svg>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
