import { useEffect, useRef } from 'react';
import { useMarketStore, TickData } from '../store/marketStore';

interface UseMarketStreamOptions {
  symbols?: string[];
  enabled?: boolean;
}

export function useMarketStream({ symbols = [], enabled = true }: UseMarketStreamOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  const updateTick = useMarketStore((state) => state.updateTick);
  const setConnectionStatus = useMarketStore((state) => state.setConnectionStatus);
  const updateAlertSummaryToken = useMarketStore((state) => state.updateAlertSummaryToken);
  const setAlertSummaryStatus = useMarketStore((state) => state.setAlertSummaryStatus);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setConnectionStatus('disconnected');
      }
      return;
    }

    setConnectionStatus('connecting');

    const params = symbols.length > 0 ? `?symbols=${symbols.join(',')}` : '';
    const es = new EventSource(`/api/stream${params}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionStatus('connected');
    };

    es.onerror = () => {
      setConnectionStatus('disconnected');
    };

    // ── Listen for live ticks ───────────────────────────────────────────────
    es.addEventListener('tick', (event: MessageEvent) => {
      try {
        const tick: {
          s: string;
          p: number;
          v: number;
          sc: number;
          tc: number;
          sparklineTs: number;
          prevClose?: number;
          metrics?: any;
        } = JSON.parse(event.data);
        const tickData: TickData = {
          ltp: tick.p,
          volume: tick.v,
          anomalyScore: tick.sc,
          triggerCode: tick.tc,
          sparklineTs: tick.sparklineTs || Math.floor(Date.now() / 1000),
          previousClose: tick.prevClose ?? tick.metrics?.previous_close,
          metrics: tick.metrics,
        };
        updateTick(tick.s, tickData);
      } catch (err) {
        console.error('Failed to parse SSE tick event:', err);
      }
    });

    // ── Listen for AI summary tokens ────────────────────────────────────────
    es.addEventListener('summary_token', (event: MessageEvent) => {
      try {
        const payload: { s: string; token: string } = JSON.parse(event.data);
        updateAlertSummaryToken(payload.s, payload.token);
      } catch (err) {
        console.error('Failed to parse summary_token:', err);
      }
    });

    es.addEventListener('summary_done', (event: MessageEvent) => {
      try {
        const payload: { s: string } = JSON.parse(event.data);
        setAlertSummaryStatus(payload.s, { isLoading: false, isError: false });
      } catch (err) {
        console.error('Failed to parse summary_done:', err);
      }
    });

    es.addEventListener('summary_error', (event: MessageEvent) => {
      try {
        const payload: { s: string } = JSON.parse(event.data);
        setAlertSummaryStatus(payload.s, { isLoading: false, isError: true });
      } catch (err) {
        console.error('Failed to parse summary_error:', err);
      }
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnectionStatus('disconnected');
    };
  }, [enabled, symbols.join(','), setConnectionStatus, updateTick, updateAlertSummaryToken, setAlertSummaryStatus]);
}
