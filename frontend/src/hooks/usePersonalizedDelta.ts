import { useMemo } from 'react';
import { useSessionStore } from '../store/sessionStore';

export interface PersonalizedDeltaResult {
  lastSeenPrice: number | null;
  deltaBps: number | null;
  hasBaseline: boolean;
}

/**
 * Computes personalized session delta between current live price and user's last-seen exit price.
 * (ltp - lastSeenPrice) / lastSeenPrice * 10000 (basis points).
 */
export function usePersonalizedDelta(symbol: string, currentLtp?: number): PersonalizedDeltaResult {
  const checkpoint = useSessionStore((state) => state.checkpoint);

  return useMemo(() => {
    if (!checkpoint?.last_seen_prices) {
      return { lastSeenPrice: null, deltaBps: null, hasBaseline: false };
    }

    const lastPrice = checkpoint.last_seen_prices[symbol];
    if (!lastPrice || lastPrice <= 0 || !currentLtp) {
      return { lastSeenPrice: lastPrice || null, deltaBps: null, hasBaseline: !!lastPrice };
    }

    // Sanitize against corrupted legacy snapshots where price was 100x
    let effectiveLastPrice = lastPrice;
    if (effectiveLastPrice > currentLtp * 1.5 || effectiveLastPrice < currentLtp * 0.5) {
      effectiveLastPrice = currentLtp;
    }

    const bps = Math.round(((currentLtp - effectiveLastPrice) / effectiveLastPrice) * 10000);
    return {
      lastSeenPrice: effectiveLastPrice,
      deltaBps: bps,
      hasBaseline: true,
    };
  }, [checkpoint, symbol, currentLtp]);
}
