import { TickData } from '../store/marketStore';

export interface CheckpointSnapshot {
  user_id?: string;
  last_seen_ts: number;
  price_snapshot: Record<string, number>;
  device_hint?: string;
}

/**
 * Persist session checkpoint via navigator.sendBeacon on tab hide or beforeunload.
 * Guaranteed execution even when the user closes the window.
 */
export function persistCheckpoint(
  userId: string | null,
  watchlistSymbols: string[],
  ticks: Record<string, TickData>
): void {
  if (!userId) return;

  const priceSnapshot: Record<string, number> = {};
  for (const sym of watchlistSymbols) {
    if (ticks[sym]?.ltp) {
      priceSnapshot[sym] = ticks[sym].ltp;
    }
  }

  const payload: CheckpointSnapshot = {
    user_id: userId,
    last_seen_ts: Math.floor(Date.now() / 1000),
    price_snapshot: priceSnapshot,
    device_hint: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/session/sync', blob);
  } else {
    // Fallback if sendBeacon not supported
    fetch('/api/session/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((err) => console.error('Checkpoint sync failed:', err));
  }
}
