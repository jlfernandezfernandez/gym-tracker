/** Telegram WebApp bridge: init, auth check and haptics. */
export const tg = (window as any).Telegram?.WebApp;

if (tg) {
  tg.expand();
  tg.setHeaderColor?.('#f6f7f9');
  tg.setBackgroundColor?.('#f6f7f9');
}

export const inTelegram = () => !!(tg?.initData && tg.initData.length > 10);

export function haptic(t?: string) {
  try {
    if (!tg) return;
    t === 'ok'
      ? tg.HapticFeedback.notificationOccurred('success')
      : t === 'bad'
        ? tg.HapticFeedback.notificationOccurred('error')
        : tg.HapticFeedback.impactOccurred('light');
  } catch {}
}
