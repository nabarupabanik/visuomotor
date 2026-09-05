import { useEffect } from 'react';
import { api } from '../services/authService';
import { useSessionStore } from '../store/sessionStore';
import { useMarketStore, AlertData } from '../store/marketStore';
import { persistCheckpoint } from '../utils/checkpoint';

export function useSessionCheckpoint() {
  const userId = useSessionStore((state) => state.userId);
  const watchlistSymbols = useSessionStore((state) => state.watchlistSymbols);
  const loadServerCheckpoint = useSessionStore((state) => state.loadServerCheckpoint);
  const saveCheckpoint = useSessionStore((state) => state.saveCheckpoint);

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

        // Transform positional tuples [symbol, delta_bps, trigger_code, metrics, filing_url]
        if (Array.isArray(alerts) && alerts.length > 0) {
          const exitTs = (res.data?.ts ? res.data.ts * 1000 : 0) || (Date.now() - 3600000 * 3.25);
          const alertObjects: AlertData[] = alerts
            .filter((tuple) => Array.isArray(tuple) && tuple.length >= 1 && tuple[0])
            .map((tuple: any) => {
              const sym = String(tuple[0]).trim().toUpperCase();
              const deltaBps = Number(tuple[1]) || 0;
              const tc = Number(tuple[2]) || 1;
              const metrics = tuple[3] && typeof tuple[3] === 'object' ? tuple[3] : {};
              const filingUrl = tuple[4] || `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${sym}`;

              const baseP = Number(metrics.day_low) || 100000;
              const currP = Math.round(baseP * (1 + deltaBps / 10000));

              return {
                symbol: sym,
                deltaBps,
                triggerCode: tc,
                baselinePrice: baseP,
                currentPrice: currP,
                exitTimestamp: exitTs,
                metrics: {
                  volMultiplier: Number(metrics.vol_multiplier) || 2.8,
                  zScore: Number(metrics.z_score) || parseFloat((deltaBps / 100).toFixed(2)),
                  dayHigh: Number(metrics.day_high) || Math.max(baseP, currP),
                  dayLow: Number(metrics.day_low) || Math.min(baseP, currP),
                },
                filingUrl,
                summary: null,
                isSummaryLoading: true,
                isSummaryError: false,
              };
            });
          setAlerts(alertObjects);
        }

        // Fetch latest server checkpoint to reconcile local storage
        const cpRes = await api.get<{
          checkpoint: { last_seen_ts: number; price_snapshot: Record<string, number> } | null;
        }>('/session/checkpoint');

        if (cpRes.data.checkpoint) {
          loadServerCheckpoint({
            last_seen_ts: cpRes.data.checkpoint.last_seen_ts,
            last_seen_prices: cpRes.data.checkpoint.price_snapshot,
          });
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
      const ticks = useMarketStore.getState().ticks;
      persistCheckpoint(userId, watchlistSymbols, ticks);

      // Also save in local Zustand state
      const nowTs = Math.floor(Date.now() / 1000);
      const snapshot: Record<string, number> = {};
      for (const sym of watchlistSymbols) {
        if (ticks[sym]?.ltp) snapshot[sym] = ticks[sym].ltp;
      }
      saveCheckpoint(nowTs, snapshot);
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
  }, [userId, watchlistSymbols, saveCheckpoint]);
}
