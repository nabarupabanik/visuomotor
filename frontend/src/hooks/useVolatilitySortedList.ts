import { useMemo } from 'react';
import { useMarketStore } from '../store/marketStore';
import { WatchlistItemDto } from '../services/watchlistService';

export function useVolatilitySortedList(
  items: WatchlistItemDto[],
  sortBy: 'volatility' | 'custom' = 'custom'
): WatchlistItemDto[] {
  const ticks = useMarketStore((state) => state.ticks);

  return useMemo(() => {
    if (sortBy === 'custom') {
      return [...items].sort((a, b) => a.display_order - b.display_order);
    }

    // Sort descending by continuous Isolation Forest anomaly score
    return [...items].sort((a, b) => {
      const scoreA = ticks[a.symbol]?.anomalyScore ?? 0;
      const scoreB = ticks[b.symbol]?.anomalyScore ?? 0;
      return scoreB - scoreA;
    });
  }, [items, sortBy, ticks]);
}
