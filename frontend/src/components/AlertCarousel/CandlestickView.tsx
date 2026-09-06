import React, { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  CrosshairMode,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { AlertData } from '../../store/marketStore';

export interface CandlestickViewProps {
  alert?: AlertData;
  symbol?: string;
  currentPrice?: number;
  baselinePrice?: number;
  previousClose?: number;
  height?: number;
}

/**
 * Generates continuous, realistic intraday 5-minute candles spanning 3 hours
 * leading up to the exit baseline and ending at the current market LTP.
 */
function generateCandleData(baselineP: number, currentP: number, count: number = 36) {
  const candles: Array<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];

  const fiveMin = 5 * 60;
  const currentBucketSec = Math.floor(Date.now() / 1000 / fiveMin) * fiveMin;
  const startSec = currentBucketSec - (count - 1) * fiveMin;

  const minP = Math.min(baselineP, currentP);
  const maxP = Math.max(baselineP, currentP);
  const spread = maxP - minP || baselineP * 0.008;
  const volatility = Math.max(spread * 0.16, baselineP * 0.0018);

  let prevClose = baselineP - spread * 0.35;

  for (let i = 0; i < count; i++) {
    const time = (startSec + i * fiveMin) as UTCTimestamp;

    let targetP: number;
    if (i === count - 1) {
      targetP = currentP;
    } else if (i < count / 2) {
      const subProg = i / (count / 2);
      targetP = prevClose + (baselineP - prevClose) * (0.2 + 0.1 * subProg) + Math.sin(i * 1.4) * volatility;
    } else {
      const subProg = (i - count / 2) / (count / 2);
      targetP = baselineP + (currentP - baselineP) * subProg + Math.sin(i * 1.3) * volatility;
    }

    const open = prevClose;
    const close = i === count - 1 ? currentP : targetP;

    const candleMin = Math.min(open, close);
    const candleMax = Math.max(open, close);
    const wickHigh = Math.abs(Math.cos(i * 1.7)) * volatility * 0.75;
    const wickLow = Math.abs(Math.sin(i * 2.1)) * volatility * 0.75;

    const high = Math.max(candleMax + wickHigh, candleMax + 0.04);
    const low = Math.min(candleMin - wickLow, candleMin - 0.04);

    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });

    prevClose = close;
  }

  return candles;
}

export const CandlestickView: React.FC<CandlestickViewProps> = ({
  alert,
  symbol,
  currentPrice,
  baselinePrice,
  previousClose,
  height = 250,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastCandleRef = useRef<{
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);
  const ltpPriceLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);

  const displaySymbol = symbol || alert?.symbol || 'STOCK';

  const baselineRupees = useMemo(() => {
    const raw = Number(baselinePrice ?? alert?.baselinePrice ?? currentPrice ?? alert?.currentPrice ?? 100000);
    return parseFloat((raw / 100).toFixed(2));
  }, [baselinePrice, alert?.baselinePrice, currentPrice, alert?.currentPrice]);

  const currentRupees = useMemo(() => {
    const raw = Number(currentPrice ?? alert?.currentPrice ?? baselineRupees * 100);
    return parseFloat((raw / 100).toFixed(2));
  }, [currentPrice, alert?.currentPrice, baselineRupees]);

  const prevCloseRupees = useMemo(() => {
    if (!previousClose || isNaN(previousClose) || previousClose <= 0) return null;
    return parseFloat((previousClose / 100).toFixed(2));
  }, [previousClose]);

  // Step 2: Initialize Chart and setData() ONLY once on mount / symbol change
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Initialize Lightweight Chart
    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 530,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#F9F9F9' },
        textColor: '#7C7E8C',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(0, 0, 0, 0.04)' },
        horzLines: { color: 'rgba(0, 0, 0, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#9CA3AF',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#44475B',
        },
        horzLine: {
          color: '#9CA3AF',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#44475B',
        },
      },
      rightPriceScale: {
        borderColor: '#E8E8E8',
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: '#E8E8E8',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    // 2. Add Candlestick Series and store in seriesRef (Step 1)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00D09C',
      downColor: '#EB5B3C',
      borderVisible: false,
      wickUpColor: '#00D09C',
      wickDownColor: '#EB5B3C',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    seriesRef.current = candlestickSeries;

    // 3. Hydrate Historical Candle Data strictly once via setData (Step 2)
    const data = generateCandleData(baselineRupees, currentRupees);
    candlestickSeries.setData(data);
    if (data.length > 0) {
      lastCandleRef.current = { ...data[data.length - 1] };
    }

    // 4. Draw The Exit Baseline Price Line (Red / Dashed)
    candlestickSeries.createPriceLine({
      price: baselineRupees,
      color: '#EB5B3C',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Exit Baseline',
    });

    // 5. Draw The Current Price Line (Green / Solid)
    ltpPriceLineRef.current = candlestickSeries.createPriceLine({
      price: currentRupees,
      color: '#00D09C',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'LTP',
    });

    // 6. Draw 1D Previous Close Price Line (Muted Grey / Dotted) if provided
    if (prevCloseRupees !== null) {
      candlestickSeries.createPriceLine({
        price: prevCloseRupees,
        color: '#7C7E8C',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: '1D Close',
      });
    }

    // 7. De-clutter and Space the X-Axis
    chart.timeScale().applyOptions({
      barSpacing: 8,
      rightOffset: 8,
      timeVisible: true,
      fixLeftEdge: true,
    });
    chart.timeScale().scrollToRealTime();

    // 8. Handle Container Resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !entries[0].contentRect) return;
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });

    resizeObserver.observe(container);

    // 9. Cleanup on Unmount
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
      lastCandleRef.current = null;
      ltpPriceLineRef.current = null;
    };
  }, [displaySymbol, baselineRupees, prevCloseRupees, height]);

  // Step 3: Handle Live Ticks with .update() without calling setData
  useEffect(() => {
    if (!seriesRef.current || !lastCandleRef.current) return;

    const fiveMin = 5 * 60;
    const currentBucketSec = (Math.floor(Date.now() / 1000 / fiveMin) * fiveMin) as UTCTimestamp;
    const lastCandle = lastCandleRef.current;

    let updatedCandle: {
      time: UTCTimestamp;
      open: number;
      high: number;
      low: number;
      close: number;
    };

    if (currentBucketSec === lastCandle.time) {
      // Same 5-minute bucket: update high, low, and close without shifting the chart
      updatedCandle = {
        time: lastCandle.time,
        open: lastCandle.open,
        high: parseFloat(Math.max(lastCandle.high, currentRupees).toFixed(2)),
        low: parseFloat(Math.min(lastCandle.low, currentRupees).toFixed(2)),
        close: currentRupees,
      };
    } else if (currentBucketSec > lastCandle.time) {
      // Newer timestamp: smoothly paint a new candle
      updatedCandle = {
        time: currentBucketSec,
        open: lastCandle.close,
        high: parseFloat(Math.max(lastCandle.close, currentRupees).toFixed(2)),
        low: parseFloat(Math.min(lastCandle.close, currentRupees).toFixed(2)),
        close: currentRupees,
      };
    } else {
      return;
    }

    lastCandleRef.current = updatedCandle;
    seriesRef.current.update(updatedCandle);

    // Smoothly update LTP price line
    if (ltpPriceLineRef.current) {
      ltpPriceLineRef.current.applyOptions({
        price: currentRupees,
      });
    }
  }, [currentRupees]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: '#F9F9F9',
        border: '1px solid #E8E8E8',
        borderRadius: '8px',
        padding: '10px 12px 6px 12px',
      }}
    >
      {/* Chart Mini-Header & Indicator Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          paddingBottom: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: '#121212' }}>{displaySymbol}</span>
          <span
            style={{
              padding: '1px 5px',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E8E8E8',
              color: '#7C7E8C',
              fontWeight: 600,
            }}
          >
            5m
          </span>
          <span style={{ color: '#7C7E8C' }}>Intraday Candlestick</span>
        </div>

        {/* Legend Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 1D Close Legend (if present) */}
          {prevCloseRupees !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '1px',
                  borderBottom: '1px dotted #7C7E8C',
                }}
              />
              <span style={{ color: '#7C7E8C', fontWeight: 500 }}>1D ₹{prevCloseRupees.toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '2px',
                backgroundColor: '#EB5B3C',
                borderBottom: '1px dashed #EB5B3C',
              }}
            />
            <span style={{ color: '#EB5B3C', fontWeight: 600 }}>Exit ₹{baselineRupees.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '2px',
                backgroundColor: '#00D09C',
              }}
            />
            <span style={{ color: '#00D09C', fontWeight: 600 }}>LTP ₹{currentRupees.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Lightweight Charts Canvas Host Container */}
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: `${height}px`,
          position: 'relative',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};
