export function Loading({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div class="grid min-h-[260px] place-content-center justify-items-center gap-3">
      <div class="size-6 animate-[spin_.7s_linear_infinite] rounded-full border-2 border-edge border-t-accent will-change-transform" />
      <p>{message}</p>
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: any }) {
  return (
    <div class="px-4 py-12 text-center">
      <div class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-2xl shadow-[inset_0_0_0_1px_var(--color-edge)]">
        {icon}
      </div>
      <p>{children}</p>
    </div>
  );
}

/** KPI tile: label above value, per the app's stat convention. */
export function Stat({ label, value, surface = false }: { label: string; value: any; surface?: boolean }) {
  return (
    <div class={`rounded-control px-2 py-[14px] text-center ${surface ? 'bg-surface' : 'bg-surface-2'}`}>
      <span class="block text-[.62rem] font-bold tracking-[.07em] text-hint uppercase">{label}</span>
      <b class="mt-1 block text-[1.02rem] tracking-[-.01em]">{value}</b>
    </div>
  );
}

export function BusyButton({
  busy,
  busyLabel,
  class: cssClass = 'min-h-[50px] w-full cursor-pointer rounded-2xl border-0 bg-ink px-[17px] py-[13px] text-[.94rem] font-[720] text-white transition-[transform,opacity] duration-150 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[.97] active:opacity-85 disabled:pointer-events-none disabled:opacity-35',
  onClick,
  children,
}: {
  busy: boolean;
  busyLabel: string;
  class?: string;
  onClick: () => void;
  children: any;
}) {
  return (
    <button class={cssClass} disabled={busy} onClick={onClick} aria-busy={busy}>
      {busy ? (
        <>
          <span class="mr-[7px] inline-block size-[13px] animate-[spin_.6s_linear_infinite] rounded-full border-2 border-white/40 border-t-white align-[-2px] will-change-transform" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
