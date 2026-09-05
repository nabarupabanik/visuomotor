import { useEffect } from 'react';
import { api } from '../services/authService';
import { useSessionStore } from '../store/sessionStore';
import { useMarketStore, AlertData } from '../store/marketStore';
import { captureExitSnapshot } from '../utils/checkpoint';

export function useSessionCheckpoint() {
  const userId = useSessionStore((state) => state.userId);
  const loadServerCheckpoint = useSessionStore((state) => state.loadServerCheckpoint);
  const setAlerts = useMarketStore((state) => state.setAlerts);

  // 1. Initial hydration on mount
  useEffect(() => {
    if (!userId) return;

    const hydrateSession = async () => {
      try {
        const res = await api.get<{
          ts: number;
          mode: 'live' | 'fallback';
          alerts: Array<[string, number, number]>;
        }>('/session/hydrate');

        const { alerts } = res.data;

        // 1. Fetch latest server checkpoint to reconcile local storage
        let serverLastSeenPrices: Record<string, number> | null = null;
        try {
          const cpRes = await api.get<{
            checkpoint: { last_seen_ts: number; price_snapshot: Record<string, number> } | null;
          }>('/session/checkpoint');

          if (cpRes.data.checkpoint) {
            serverLastSeenPrices = cpRes.data.checkpoint.price_snapshot;
            loadServerCheckpoint({
              last_seen_ts: cpRes.data.checkpoint.last_seen_ts,
              last_seen_prices: cpRes.data.checkpoint.price_snapshot,
            });
          }
        } catch {}

        const sessionCheckpoint = useSessionStore.getState().checkpoint;
        const exitTs =
          (res.data?.ts ? res.data.ts * 1000 : 0) ||
          (sessionCheckpoint?.last_seen_ts ? sessionCheckpoint.last_seen_ts * 1000 : 0) ||
          (Date.now() - 3600000 * 3.25);

        // 2. Transform positional tuples [symbol, delta_bps, trigger_code, metrics, filing_url]
        if (Array.isArray(alerts) && alerts.length > 0) {
          const alertObjects: AlertData[] = alerts
            .filter((tuple) => Array.isArray(tuple) && tuple.length >= 1 && tuple[0])
            .map((tuple: any) => {
              const sym = String(tuple[0]).trim().toUpperCase();
              const deltaBps = Number(tuple[1]) || 0;
              const tc = Number(tuple[2]) || 1;
              const metrics = tuple[3] && typeof tuple[3] === 'object' ? tuple[3] : {};
              const filingUrl = tuple[4] || `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${sym}`;

              // True baseline from sessionStore / server checkpoint
              const actualBaseline =
                sessionCheckpoint?.last_seen_prices?.[sym] ??
                serverLastSeenPrices?.[sym] ??
                Number(metrics.baseline_price) ??
                Number(metrics.baselinePrice);

              const currentLivePrice =
                useMarketStore.getState().ticks[sym]?.ltp ??
                Number(metrics.current_price) ??
                (actualBaseline ? Math.round(actualBaseline * (1 + deltaBps / 10000)) : 100000);

              const referencePrice = actualBaseline && actualBaseline > 0
                ? actualBaseline
                : deltaBps !== 0
                  ? Math.round(currentLivePrice / (1 + deltaBps / 10000))
                  : currentLivePrice;

              const calculatedDelta = referencePrice > 0
                ? Math.round(((currentLivePrice - referencePrice) / referencePrice) * 10000)
                : deltaBps;

              return {
                symbol: sym,
                deltaBps: calculatedDelta,
                triggerCode: tc,
                baselinePrice: referencePrice, // Exact same referencePrice
                currentPrice: currentLivePrice,
                exitTimestamp: exitTs,
                metrics: {
                  volMultiplier: Number(metrics.vol_multiplier) || 2.8,
                  zScore: Number(metrics.z_score) || parseFloat((calculatedDelta / 100).toFixed(2)),
                  dayHigh: Number(metrics.day_high) || Math.max(referencePrice, currentLivePrice),
                  dayLow: Number(metrics.day_low) || Math.min(referencePrice, currentLivePrice),
                },
                filingUrl,
                summary: null,
                isSummaryLoading: true,
                isSummaryError: false,
              };
            });
          setAlerts(alertObjects);
        }
      } catch (err) {
        console.error('Session hydration failed:', err);
      }
    };

    hydrateSession();
  }, [userId, loadServerCheckpoint, setAlerts]);

  // 2. Persist checkpoint on beforeunload / visibility hidden / unmount
  useEffect(() => {
    const handleUnloadOrHide = () => {
      captureExitSnapshot(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleUnloadOrHide();
      }
    };

    window.addEventListener('beforeunload', handleUnloadOrHide);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      handleUnloadOrHide();
      window.removeEventListener('beforeunload', handleUnloadOrHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
