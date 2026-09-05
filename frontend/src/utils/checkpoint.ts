import { TickData, AlertData, useMarketStore } from '../store/marketStore';
import { useSessionStore } from '../store/sessionStore';
import { getAccessToken } from '../services/authService';

export interface ExitSnapshotPayload {
  user_id?: string;
  last_seen_ts: number;
  price_snapshot: Record<string, number>; // strictly integer paise
  alerts?: AlertData[];
  device_hint?: string;
}

export interface CheckpointSnapshot extends ExitSnapshotPayload {}

/**
 * Unified Exit Snapshotting Utility.
 * Collects current prices of all watched stocks from marketStore as integer paise.
 *
 * - For Tab Close (visibilitychange / beforeunload): Uses navigator.sendBeacon('/api/session/sync')
 * - For Explicit Logout: Uses standard fetch with keepalive: true
 * - Local Mirroring: Immediately saves payload to localStorage.setItem('wl_exit_snapshot')
 */
export async function captureExitSnapshot(
  isUnloading: boolean = false
): Promise<ExitSnapshotPayload | null> {
  const sessionState = useSessionStore.getState();
  const marketState = useMarketStore.getState();

  const userId = sessionState.userId;
  const watchlistSymbols = sessionState.watchlistSymbols || [];
  const ticks = marketState.ticks || {};
  const currentAlerts = marketState.alerts || [];

  const nowTs = Math.floor(Date.now() / 1000);
  const priceSnapshot: Record<string, number> = {};

  // 1. Collect current prices of all watched stocks (ensure integers in paise)
  for (const sym of watchlistSymbols) {
    const ltp = ticks[sym]?.ltp;
    if (ltp !== undefined && ltp > 0) {
      priceSnapshot[sym] = Math.round(Number(ltp));
    } else if (sessionState.checkpoint?.last_seen_prices?.[sym]) {
      priceSnapshot[sym] = Math.round(Number(sessionState.checkpoint.last_seen_prices[sym]));
    }
  }

  // Fallback: If watchlistSymbols was empty, collect from active ticks map
  if (Object.keys(priceSnapshot).length === 0) {
    for (const [sym, tick] of Object.entries(ticks)) {
      if (tick?.ltp && tick.ltp > 0) {
        priceSnapshot[sym] = Math.round(Number(tick.ltp));
      }
    }
  }

  const payload: ExitSnapshotPayload = {
    user_id: userId || undefined,
    last_seen_ts: nowTs,
    price_snapshot: priceSnapshot,
    alerts: currentAlerts,
    device_hint: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
  };

  // 2. Local Mirroring: immediately save this exact payload to localStorage
  try {
    localStorage.setItem('wl_exit_snapshot', JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to mirror exit snapshot locally:', err);
  }

  // Also update local Zustand session checkpoint synchronously
  sessionState.saveCheckpoint(nowTs, priceSnapshot);

  // 3. Network Syncing
  const payloadString = JSON.stringify(payload);

  if (isUnloading) {
    // For Tab Close: Use navigator.sendBeacon
    let beaconSent = false;
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payloadString], { type: 'application/json' });
      beaconSent = navigator.sendBeacon('/api/session/sync', blob);
    }

    if (!beaconSent) {
      try {
        fetch('/api/session/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadString,
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }
  } else {
    // For Explicit Logout: Use standard fetch with keepalive and auth header
    try {
      const token = getAccessToken();
      await fetch('/api/session/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payloadString,
        keepalive: true,
      });
    } catch (err) {
      console.error('Explicit logout session sync failed:', err);
    }
  }

  return payload;
}

/**
 * Backward-compatible wrapper for persistCheckpoint
 */
export function persistCheckpoint(
  _userId: string | null,
  _watchlistSymbols: string[],
  _ticks: Record<string, TickData>
): void {
  captureExitSnapshot(true);
}
