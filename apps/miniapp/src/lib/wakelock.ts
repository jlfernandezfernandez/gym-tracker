/** Screen Wake Lock API — keeps phone display active during workouts. */
import { useEffect } from 'preact/hooks';

export const wakeLockSupported = (): boolean => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

let sentinel: any = null;
let wanted = false;
let pending = false;

async function acquire() {
  if (!wanted || sentinel || pending || !wakeLockSupported()) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  pending = true;
  try {
    const s = await (navigator as any).wakeLock.request('screen');
    if (!wanted) {
      s.release().catch(() => {});
      return;
    }
    sentinel = s;
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    sentinel = null;
  } finally {
    pending = false;
  }
}

const onVisible = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') acquire();
};

export function requestWakeLock() {
  if (wanted) return;
  wanted = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
  acquire();
}

export function releaseWakeLock() {
  wanted = false;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisible);
  }
  const s = sentinel;
  sentinel = null;
  if (s) s.release().catch(() => {});
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    requestWakeLock();
    return () => releaseWakeLock();
  }, [enabled]);
}
