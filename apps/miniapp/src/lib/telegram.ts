/** Telegram WebApp bridge: init, auth check and haptics. */
export const tg = (window as any).Telegram?.WebApp;

if (tg) {
  tg.expand();
  tg.setHeaderColor?.('#f5f5f7');
  tg.setBackgroundColor?.('#f5f5f7');
}

export const inTelegram = () => !!(tg?.initData && tg.initData.length > 10);

export function haptic(feedback?: 'ok' | 'bad' | 'light') {
  try {
    if (!tg) return;
    feedback === 'ok'
      ? tg.HapticFeedback.notificationOccurred('success')
      : feedback === 'bad'
        ? tg.HapticFeedback.notificationOccurred('error')
        : tg.HapticFeedback.impactOccurred('light');
  } catch {}
}
