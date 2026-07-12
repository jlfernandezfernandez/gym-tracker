import { useEffect, useRef } from 'preact/hooks';
import { BusyButton } from './feedback';

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: any;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    open ? dialogRef.current?.showModal() : dialogRef.current?.close();
  }, [open]);
  return (
    <dialog ref={dialogRef} class="native-sheet m-auto mb-2.5 w-[min(100%-20px,430px)] rounded-[26px] border border-white/50 bg-surface/94 p-5 text-ink shadow-sheet backdrop-blur-3xl backdrop-saturate-150 min-[720px]:m-auto [&::backdrop]:bg-black/35" onClose={onCancel}>
      <div class="mx-auto mb-4 h-1 w-9 rounded-pill bg-track" />
      <h2>{title}</h2>
      <p class="mt-1">{message}</p>
      {children}
      <div class="mt-4 flex items-center gap-2 [&>button]:min-w-0 [&>button]:flex-1">
        <button class="min-h-[50px] rounded-2xl border-0 bg-surface-2 px-4 font-[680] text-ink transition-transform duration-150 active:scale-[.97]" onClick={onCancel}>
          Cancelar
        </button>
        <BusyButton busy={busy} busyLabel="…" onClick={onConfirm}>
          {confirmLabel}
        </BusyButton>
      </div>
    </dialog>
  );
}
