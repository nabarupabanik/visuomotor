import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * SessionStore — LOW FREQUENCY persistent session data.
 *
 * Stores the user's identity, active watchlist, and the session checkpoint
 * (last-seen timestamp + prices). Updated infrequently; safe to use with
 * standard React component subscriptions.
 *
 * Persisted to localStorage via zustand/middleware 'persist'.
 */

export interface SessionCheckpoint {
  last_seen_ts: number;                       // Unix epoch (seconds)
  last_seen_prices: Record<string, number>;   // { RELIANCE: 248500 } (paise)
}

function loadInitialExitCheckpoint(): SessionCheckpoint | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wl_exit_snapshot') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.price_snapshot && parsed.last_seen_ts) {
        const cleanPrices: Record<string, number> = {};
        for (const [sym, price] of Object.entries(parsed.price_snapshot)) {
          cleanPrices[sym] = Math.round(Number(price));
        }
        return {
          last_seen_ts: Number(parsed.last_seen_ts),
          last_seen_prices: cleanPrices,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to parse initial exit snapshot in sessionStore:', err);
  }
  return null;
}

interface SessionState {
  // Auth
  userId: string | null;
  accessToken: string | null;

  // Active watchlist
  watchlistId: string | null;
  watchlistName: string;
  watchlistSymbols: string[];  // ordered array of ticker strings

  // Session checkpoint (personalized baseline)
  checkpoint: SessionCheckpoint | null;

  // Actions
  setAuth: (userId: string, token: string) => void;
  setUserId: (userId: string | null) => void;
  setActiveWatchlistId: (id: string | null) => void;
  setWatchlistSymbols: (symbols: string[]) => void;
  clearAuth: () => void;
  setWatchlist: (id: string, name: string, symbols: string[]) => void;
  setSymbols: (symbols: string[]) => void;
  saveCheckpoint: (ts: number, prices: Record<string, number>) => void;
  loadServerCheckpoint: (checkpoint: SessionCheckpoint) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      // Initial state with instant optimistic hydration
      userId: null,
      accessToken: null,
      watchlistId: null,
      watchlistName: '',
      watchlistSymbols: [],
      checkpoint: loadInitialExitCheckpoint(),

      // Set auth after login/register
      setAuth: (userId, accessToken) =>
        set({ userId, accessToken }),

      setUserId: (userId) => set({ userId }),
      setActiveWatchlistId: (watchlistId) => set({ watchlistId }),
      setWatchlistSymbols: (watchlistSymbols) => set({ watchlistSymbols }),

      // Clear on logout
      clearAuth: () =>
        set({ userId: null, accessToken: null, watchlistId: null,
              watchlistSymbols: [], checkpoint: null }),

      // Set active watchlist
      setWatchlist: (id, name, symbols) =>
        set({ watchlistId: id, watchlistName: name, watchlistSymbols: symbols }),

      setSymbols: (symbols) => set({ watchlistSymbols: symbols }),

      // Persist checkpoint on session exit
      saveCheckpoint: (ts, prices) =>
        set({ checkpoint: { last_seen_ts: ts, last_seen_prices: prices } }),

      // Overwrite local checkpoint with server's if server is newer (conflict resolution)
      loadServerCheckpoint: (serverCheckpoint) =>
        set((state) => {
          const localTs = state.checkpoint?.last_seen_ts ?? 0;
          if (serverCheckpoint.last_seen_ts >= localTs) {
            try {
              if (typeof window !== 'undefined') {
                const currentSnapshot = localStorage.getItem('wl_exit_snapshot');
                const parsed = currentSnapshot ? JSON.parse(currentSnapshot) : {};
                localStorage.setItem(
                  'wl_exit_snapshot',
                  JSON.stringify({
                    ...parsed,
                    last_seen_ts: serverCheckpoint.last_seen_ts,
                    price_snapshot: serverCheckpoint.last_seen_prices,
                  })
                );
              }
            } catch {}
            return { checkpoint: serverCheckpoint };
          }
          return {};  // local is newer, keep it
        }),
    }),
    {
      name: 'wl_session',   // localStorage key
      partialize: (state) => ({
        userId: state.userId,
        watchlistId: state.watchlistId,
        watchlistName: state.watchlistName,
        watchlistSymbols: state.watchlistSymbols,
        checkpoint: state.checkpoint,
      }),
    }
  )
);
