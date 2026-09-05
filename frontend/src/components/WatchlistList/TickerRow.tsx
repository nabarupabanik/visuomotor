import React, { useRef, useEffect } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { usePersonalizedDelta } from '../../hooks/usePersonalizedDelta';
import { formatPaise, formatBps, formatVolume } from '../../utils/formatters';
import { TRIGGER_LABELS, TRIGGER_COLORS, TriggerCode } from '../../constants/triggerCodes';
import { MicroSparkline } from './MicroSparkline';
import { useSparklineData } from '../../hooks/useSparklineData';

interface TickerRowProps {
  symbol: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export const TickerRow: React.FC<TickerRowProps> = ({
  symbol,
  onRemove,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  const lastFlashTimeRef = useRef<number>(0);

  // Subscribe only to this symbol's tick from marketStore
  const tick = useMarketStore((state) => state.ticks[symbol]);
  const ltp = tick?.ltp;

  // Personalized delta relative to last session
  const { deltaBps, hasBaseline } = usePersonalizedDelta(symbol, ltp);

  // Micro-sparkline session tick history
  const sparklineData = useSparklineData(symbol);

  // Direct DOM mutation for high-frequency price updates + throttled flash animation
  useEffect(() => {
    if (!ltp) return;

    // Direct DOM text update (bypasses virtual DOM diffing)
    if (priceRef.current) {
      priceRef.current.textContent = formatPaise(ltp);
    }

    // Flash animation throttled to max 1 flash per second
    const now = Date.now();
    if (prevPriceRef.current !== null && now - lastFlashTimeRef.current > 800) {
      if (ltp > prevPriceRef.current) {
        rowRef.current?.classList.remove('flash-down');
        rowRef.current?.classList.add('flash-up');
        lastFlashTimeRef.current = now;
        setTimeout(() => rowRef.current?.classList.remove('flash-up'), 600);
      } else if (ltp < prevPriceRef.current) {
        rowRef.current?.classList.remove('flash-up');
        rowRef.current?.classList.add('flash-down');
        lastFlashTimeRef.current = now;
        setTimeout(() => rowRef.current?.classList.remove('flash-down'), 600);
      }
    }
    prevPriceRef.current = ltp;
  }, [ltp]);

  const rawCode = tick?.triggerCode || 0;
  const triggerCode = (rawCode >= 0 && rawCode <= 5 ? rawCode : 0) as TriggerCode;
  const hasTrigger = triggerCode > 0;
  const triggerLabel = TRIGGER_LABELS[triggerCode];
  const triggerColor = TRIGGER_COLORS[triggerCode] || '#00D09C';

  const isPositive = deltaBps !== null && deltaBps >= 0;

  // 52W perf bar: use anomalyScore (0–1) as fill indicator position
  const perfScore = tick?.anomalyScore ?? 0.5;

  // Volume display
  const volume = tick?.volume ?? null;

  // Avatar initials (first 2–3 chars)
  const initials = symbol.slice(0, 3);

  return (
    <div
      ref={rowRef}
      className="ticker-row wl-table-grid"
      style={{
        padding: '0 16px',
        minHeight: '56px',
        userSelect: 'none',
      }}
    >
      {/* ── Col 1: Company Avatar + Name ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '8px' }}>
        {/* Squircle Avatar */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#F4F5F7',
            border: '1px solid #E8E9EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.72rem',
            color: '#44475B',
            letterSpacing: '-0.02em',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'nowrap' }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: '0.9rem',
                color: '#44475B',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              {symbol}
            </span>
            {hasTrigger && (
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: `${triggerColor}14`,
                  color: triggerColor,
                  border: `1px solid ${triggerColor}28`,
                  whiteSpace: 'nowrap',
                }}
              >
                {triggerLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>
            NSE
          </div>
        </div>
      </div>

      {/* ── Col 2: Trend Sparkline ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <MicroSparkline data={sparklineData} width={96} height={26} />
      </div>

      {/* ── Col 3: Market Price ────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right' }}>
        <span
          ref={priceRef}
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: '#44475B',
            letterSpacing: '-0.01em',
          }}
        >
          {ltp ? formatPaise(ltp) : '—'}
        </span>
      </div>

      {/* ── Col 4: Change (since exit) ─────────────────────────────────────── */}
      <div style={{ textAlign: 'right' }}>
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: hasBaseline && deltaBps !== null
              ? isPositive
                ? 'var(--color-green)'
                : 'var(--color-red)'
              : 'var(--text-muted)',
          }}
        >
          {hasBaseline && deltaBps !== null ? (
            formatBps(deltaBps)
          ) : (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>0.00%</span>
          )}
        </span>
      </div>

      {/* ── Col 5: Volume ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
          {volume !== null ? formatVolume(volume) : '—'}
        </span>
      </div>

      {/* ── Col 6: 52W Perf Bar ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '4px' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>L</span>
        <div
          style={{
            flex: 1,
            height: '4px',
            backgroundColor: '#E8E9EB',
            borderRadius: '2px',
            position: 'relative',
            minWidth: '50px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-3px',
              left: `${Math.max(0, Math.min(100, perfScore * 100))}%`,
              transform: 'translateX(-50%)',
              width: '2px',
              height: '10px',
              backgroundColor: '#44475B',
              borderRadius: '1px',
            }}
          />
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>H</span>
      </div>

      {/* ── Col 7: Remove button (hover-only) ─────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="row-hover-action"
          onClick={onRemove}
          title={`Remove ${symbol}`}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-red)';
            e.currentTarget.style.backgroundColor = 'rgba(235, 91, 60, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
};
