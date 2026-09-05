import { useState, useEffect } from 'react';
import { api } from '../services/authService';
import { useMarketStore } from '../store/marketStore';

export function useSparklineData(symbol: string, lastSeenTs?: number) {
  const [history, setHistory] = useState<Array<[number, number]>>([]);
  const liveTick = useMarketStore((state) => state.ticks[symbol]);

  // 1. Initial snapshot fetch
  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const res = await api.get<{
          symbol: string;
          history: Array<[number, number]>;
        }>('/ticks/history', {
          params: { symbol, from_ts: lastSeenTs },
        });

        if (isMounted && res.data.history) {
          setHistory(res.data.history);
        }
      } catch (err) {
        console.error(`Failed to load sparkline history for ${symbol}:`, err);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [symbol, lastSeenTs]);

  // 2. Append live ticks as they arrive
  useEffect(() => {
    if (!liveTick || !liveTick.ltp) return;

    setHistory((prev) => {
      const now = liveTick.sparklineTs || Math.floor(Date.now() / 1000);
      // Keep last 40 data points for tight sparkline resolution
      const updated = [...prev, [now, liveTick.ltp] as [number, number]];
      return updated.slice(-40);
    });
  }, [liveTick]);

  return history;
}
