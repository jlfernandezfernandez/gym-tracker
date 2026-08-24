import { useEffect, useState } from 'preact/hooks';
import { haptic } from '../lib/telegram';

export function RestTimer({
  initialSeconds = 90,
  onFinish,
  onDismiss,
}: {
  initialSeconds?: number;
  onFinish?: () => void;
  onDismiss: () => void;
}) {
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      haptic('ok');
      onFinish?.();
      return;
    }
    const timer = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const addTime = (delta: number) => {
    haptic('light');
    setRemaining((prev) => Math.max(5, prev + delta));
    setTotalSeconds((prev) => Math.max(5, prev + delta));
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0;

  return (
    <div class="my-3 overflow-hidden rounded-control border border-accent/25 bg-accent-bg/40 p-4 shadow-card">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="grid size-8 place-items-center rounded-pill bg-accent text-sm text-white">⏱️</span>
          <div>
            <h4 class="text-sm font-bold text-ink">Descanso</h4>
            <p class="text-[0.7rem] text-hint">Recupera el aliento para la siguiente serie</p>
          </div>
        </div>
        <button
          class="grid size-8 cursor-pointer place-items-center rounded-pill border-0 bg-surface-2 text-sm text-hint transition hover:text-ink active:scale-90"
          onClick={onDismiss}
          aria-label="Cerrar temporizador"
        >
          ✕
        </button>
      </div>

      <div class="my-3 flex items-center justify-center">
        <div class="font-mono text-3xl font-extrabold tracking-tight text-accent">
          {formattedTime}
        </div>
      </div>

      {/* Progress track */}
      <div class="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
        <div
          class="h-full rounded-pill bg-accent transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div class="mt-3.5 flex items-center justify-center gap-2">
        <button
          class="min-h-9 cursor-pointer rounded-pill border-0 bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-ink transition active:scale-95"
          onClick={() => addTime(-15)}
        >
          -15s
        </button>
        <button
          class="min-h-9 cursor-pointer rounded-pill border-0 bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-ink transition active:scale-95"
          onClick={() => addTime(30)}
        >
          +30s
        </button>
        <button
          class="min-h-9 cursor-pointer rounded-pill border-0 bg-accent px-5 py-1.5 text-xs font-bold text-white transition active:scale-95"
          onClick={onDismiss}
        >
          Listo
        </button>
      </div>
    </div>
  );
}
