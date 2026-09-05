import { useEffect, useCallback, useRef } from 'react';
import { api } from '../services/authService';
import { useMarketStore } from '../store/marketStore';

export function useSummaryRequest() {
  const alerts = useMarketStore((state) => state.alerts);
  const setAlertSummaryStatus = useMarketStore((state) => state.setAlertSummaryStatus);
  const inFlightRef = useRef<Set<string>>(new Set());

  const fetchSummary = useCallback(
    async (symbol: string, deltaBps: number = 0) => {
      if (inFlightRef.current.has(symbol)) return;
      inFlightRef.current.add(symbol);

      setAlertSummaryStatus(symbol, { isLoading: true, isError: false });

      try {
        const now = Math.floor(Date.now() / 1000);
        const res = await api.post<{ symbol: string; summary: string; filing_url?: string }>('/summary/generate', {
          symbol,
          start_ts: now - 14400,
          end_ts: now,
          delta_bps: deltaBps,
        });

        setAlertSummaryStatus(symbol, {
          isLoading: false,
          isError: false,
          summary: res.data.summary,
          filingUrl: res.data.filing_url || `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}`,
        });
      } catch (err) {
        console.error(`AI summary request failed for ${symbol}:`, err);
        setAlertSummaryStatus(symbol, {
          isLoading: false,
          isError: true,
          filingUrl: `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}`,
        });
      } finally {
        inFlightRef.current.delete(symbol);
      }
    },
    [setAlertSummaryStatus]
  );

  // Automatically request summaries for alerts that need one
  useEffect(() => {
    alerts.forEach((alert) => {
      if (alert.isSummaryLoading && !alert.summary && !alert.isSummaryError) {
        fetchSummary(alert.symbol, alert.deltaBps);
      }
    });
  }, [alerts, fetchSummary]);

  return { retrySummary: fetchSummary };
}
