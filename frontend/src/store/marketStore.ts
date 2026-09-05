import { create } from 'zustand';

export interface TickData {
  ltp: number;          // last traded price (paise, integer)
  volume: number;
  anomalyScore: number; // continuous Isolation Forest score (0.0–1.0)
  triggerCode: number;  // 0 = no alert, 1–5 = classified anomaly
  sparklineTs: number;  // epoch of this tick for sparkline rendering
}

export interface AlertData {
  symbol: string;
  deltaBps: number;     // basis points (e.g., 420 = +4.20%)
  triggerCode: number;
  summary: string | null;
  isSummaryLoading: boolean;
  isSummaryError: boolean;
}

export interface MarketStore {
  ticks: Record<string, TickData>;
  alerts: AlertData[];
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  lastTickTimestamp: number | null;

  setConnectionStatus: (status: 'connected' | 'connecting' | 'disconnected') => void;
  updateTick: (symbol: string, tick: TickData) => void;
  setAlerts: (alerts: AlertData[]) => void;
  addOrUpdateAlert: (alert: AlertData) => void;
  updateAlertSummaryToken: (symbol: string, token: string) => void;
  setAlertSummaryStatus: (
    symbol: string,
    status: { isLoading?: boolean; isError?: boolean; summary?: string }
  ) => void;
  reset: () => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  ticks: {},
  alerts: [],
  connectionStatus: 'disconnected',
  lastTickTimestamp: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  updateTick: (symbol, tick) =>
    set((state) => {
      const newTicks = {
        ...state.ticks,
        [symbol]: tick,
      };

      // If tick has triggerCode > 0, ensure it is registered in alerts if not present
      let newAlerts = state.alerts;
      if (tick.triggerCode > 0) {
        const existingIdx = state.alerts.findIndex((a) => a.symbol === symbol);
        if (existingIdx === -1) {
          // New alert from live tick
          newAlerts = [
            {
              symbol,
              deltaBps: 0,
              triggerCode: tick.triggerCode,
              summary: null,
              isSummaryLoading: true,
              isSummaryError: false,
            },
            ...state.alerts,
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
            }
          : a
      ),
    })),

  reset: () =>
    set({
      ticks: {},
      alerts: [],
      connectionStatus: 'disconnected',
      lastTickTimestamp: null,
    }),
}));
