import { create } from 'zustand';
import { useSessionStore } from './sessionStore';
import { api } from '../services/authService';

export interface TickData {
  ltp: number;          // last traded price (paise, integer)
  volume: number;
  anomalyScore: number; // continuous Isolation Forest score (0.0–1.0)
  triggerCode: number;  // 0 = no alert, 1–5 = classified anomaly
  sparklineTs: number;  // epoch of this tick for sparkline rendering
  metrics?: {
    vol_multiplier?: number;
    z_score?: number;
    day_high?: number;
    day_low?: number;
  };
}

export interface AlertData {
  symbol: string;
  deltaBps: number;     // basis points (e.g., 420 = +4.20%)
  triggerCode: number;
  baselinePrice: number; // in paise
  currentPrice: number;  // in paise
  exitTimestamp: number; // epoch ms
  metrics?: {
    volMultiplier?: number;
    zScore?: number;
    dayHigh: number;
    dayLow: number;
  };
  filingUrl?: string;
  isDismissed?: boolean;
  summary: string | null;
  isSummaryLoading: boolean;
  isSummaryError: boolean;
}

export interface MarketStore {
  ticks: Record<string, TickData>;
  alerts: AlertData[];
  expandedAlertSymbol: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  lastTickTimestamp: number | null;

  setConnectionStatus: (status: 'connected' | 'connecting' | 'disconnected') => void;
  setExpandedAlert: (symbol: string | null) => void;
  dismissAlert: (symbol: string) => void;
  updateTick: (symbol: string, tick: TickData) => void;
  setAlerts: (alerts: AlertData[]) => void;
  addOrUpdateAlert: (alert: AlertData) => void;
  updateAlertSummaryToken: (symbol: string, token: string) => void;
  setAlertSummaryStatus: (
    symbol: string,
    status: { isLoading?: boolean; isError?: boolean; summary?: string; filingUrl?: string }
  ) => void;
  reset: () => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  ticks: {},
  alerts: [],
  expandedAlertSymbol: null,
  connectionStatus: 'disconnected',
  lastTickTimestamp: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setExpandedAlert: (symbol) =>
    set((state) => ({
      expandedAlertSymbol: state.expandedAlertSymbol === symbol ? null : symbol,
    })),

  dismissAlert: (symbol) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.symbol !== symbol),
      expandedAlertSymbol: state.expandedAlertSymbol === symbol ? null : state.expandedAlertSymbol,
    }));
    api.post('/alerts/dismiss', { symbol }).catch(() => {});
  },

  updateTick: (symbol, tick) =>
    set((state) => {
      if (!symbol || !tick) return state;

      const newTicks = {
        ...state.ticks,
        [symbol]: tick,
      };

      const sessionState = useSessionStore.getState();
      const currentPrice = Number(tick.ltp ?? (tick as any).p) || 100000;
      const baselinePrice =
        Number(sessionState?.checkpoint?.last_seen_prices?.[symbol]) ||
        Number((sessionState as any)?.last_seen_prices?.[symbol]) ||
        currentPrice;
      const exitTimestamp =
        (sessionState?.checkpoint?.last_seen_ts ? sessionState.checkpoint.last_seen_ts * 1000 : 0) ||
        (Date.now() - 3600000 * 3.25); // default fallback ~3h 15m ago

      const calculatedDeltaBps =
        baselinePrice > 0 ? Math.round(((currentPrice - baselinePrice) / baselinePrice) * 10000) : 0;

      const tickMetrics = tick.metrics || (tick as any).m || {};
      const dayHigh = Number(tickMetrics.day_high ?? tickMetrics.dayHigh) || Math.max(currentPrice, baselinePrice);
      const dayLow = Number(tickMetrics.day_low ?? tickMetrics.dayLow) || Math.min(currentPrice, baselinePrice);
      const volMultiplier = Number(tickMetrics.vol_multiplier ?? tickMetrics.volMultiplier) || 2.85;
      const zScore = Number(tickMetrics.z_score ?? tickMetrics.zScore) || parseFloat((calculatedDeltaBps / 100.0).toFixed(2));
      const filingUrl = `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}`;

      // Update existing alerts with live price & delta progression
      let newAlerts = (state.alerts || []).map((a) =>
        a.symbol === symbol
          ? {
              ...a,
              currentPrice: currentPrice || a.currentPrice || baselinePrice,
              deltaBps: calculatedDeltaBps ?? a.deltaBps ?? 0,
              metrics: {
                volMultiplier: a.metrics?.volMultiplier ?? volMultiplier,
                zScore: a.metrics?.zScore ?? zScore,
                dayHigh: Math.max(a.metrics?.dayHigh ?? dayHigh, currentPrice),
                dayLow: Math.min(a.metrics?.dayLow ?? dayLow, currentPrice),
              },
            }
          : a
      );

      // If tick has triggerCode > 0, ensure it is registered in alerts if not present
      const triggerCode = Number(tick.triggerCode) || 0;
      if (triggerCode > 0) {
        const existingIdx = newAlerts.findIndex((a) => a.symbol === symbol);
        if (existingIdx === -1) {
          // New alert from live tick with dynamic delta calculation & diagnostic metadata
          newAlerts = [
            {
              symbol,
              deltaBps: calculatedDeltaBps,
              triggerCode,
              baselinePrice,
              currentPrice,
              exitTimestamp,
              metrics: {
                volMultiplier,
                zScore,
                dayHigh,
                dayLow,
              },
              filingUrl,
              summary: null,
              isSummaryLoading: true,
              isSummaryError: false,
            },
            ...newAlerts,
          ];
        }
      }

      return {
        ticks: newTicks,
        alerts: newAlerts,
        lastTickTimestamp: Date.now(),
      };
    }),

  setAlerts: (alerts) => set({ alerts }),

  addOrUpdateAlert: (alert) =>
    set((state) => {
      const idx = state.alerts.findIndex((a) => a.symbol === alert.symbol);
      if (idx >= 0) {
        const updated = [...state.alerts];
        updated[idx] = { ...updated[idx], ...alert };
        return { alerts: updated };
      }
      return { alerts: [alert, ...state.alerts] };
    }),

  updateAlertSummaryToken: (symbol, token) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.symbol === symbol
          ? {
              ...a,
              summary: (a.summary || '') + token,
              isSummaryLoading: false,
              isSummaryError: false,
            }
          : a
      ),
    })),

  setAlertSummaryStatus: (symbol, status) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.symbol === symbol
          ? {
              ...a,
              ...(status.isLoading !== undefined ? { isSummaryLoading: status.isLoading } : {}),
              ...(status.isError !== undefined ? { isSummaryError: status.isError } : {}),
              ...(status.summary !== undefined ? { summary: status.summary } : {}),
              ...(status.filingUrl !== undefined ? { filingUrl: status.filingUrl } : {}),
            }
          : a
      ),
    })),

    reset: () =>
    set({
      ticks: {},
      alerts: [],
      expandedAlertSymbol: null,
      connectionStatus: 'disconnected',
      lastTickTimestamp: null,
    }),
}));
