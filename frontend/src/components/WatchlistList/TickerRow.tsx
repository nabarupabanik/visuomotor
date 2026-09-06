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
  /** Optional holdings map passed from WatchlistPage: symbol -> quantity owned */
  holdings?: Record<string, number>;
  onOpenChart?: (symbol: string) => void;
}

export const TickerRow: React.FC<TickerRowProps> = ({
  symbol,
  onRemove,
  holdings,
  onOpenChart,
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

  // 1D change: relative to yesterday's close (previousClose in paise)
  const prevClose = tick?.previousClose;
  let oneDayChangeText: string | null = null;
  let oneDayColor = 'var(--text-muted)';
  if (ltp && prevClose && prevClose > 0) {
    const diffPaise = ltp - prevClose;
    const absDiffRupees = (Math.abs(diffPaise) / 100).toFixed(2);
    const pct = ((diffPaise / prevClose) * 100).toFixed(2);
    const is1DPositive = diffPaise >= 0;
    const sign = is1DPositive ? '+' : '-';
    oneDayChangeText = `${sign}₹${absDiffRupees} (${sign}${Math.abs(Number(pct)).toFixed(2)}%)`;
    oneDayColor = is1DPositive ? '#00D09C' : '#EB5B3C';
  }

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
          {/* Exchange + optional Holdings badge on the same sub-line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>NSE</span>
            {holdings && holdings[symbol] !== undefined && (
              <HoldingBadge qty={holdings[symbol]} />
            )}
          </div>
        </div>
      </div>

      {/* ── Col 2: Sparkline Trend ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MicroSparkline
          data={sparklineData}
          width={90}
          height={26}
        />
      </div>

      {/* ── Col 3: Mkt price ─────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right', justifySelf: 'end' }}>
        <span
          ref={priceRef}
          className="tabular-nums"
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

      {/* ── Col 4: 1D change ─────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right', justifySelf: 'end' }}>
        {oneDayChangeText ? (
          <span
            className="tabular-nums"
            style={{
              fontSize: '0.84rem',
              fontWeight: 600,
              color: oneDayColor,
              whiteSpace: 'nowrap',
            }}
          >
            {oneDayChangeText}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>—</span>
        )}
      </div>

      {/* ── Col 5: Change (since exit) ─────────────────────────────────────── */}
      <div style={{ textAlign: 'right', justifySelf: 'end' }}>
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
      <div style={{ textAlign: 'right', justifySelf: 'end' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
          {volume !== null ? formatVolume(volume) : '—'}
        </span>
      </div>

      {/* ── Col 6: 52W Perf Bar ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifySelf: 'end', width: '100%' }}>
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

      {/* ── Quick Actions Overlay (CSS-only hover, position:absolute) ───────
          Floats over the Volume + 52W columns on row hover.
          Left gradient fades it over underlying text — no hard edge.
          Controlled entirely by .ticker-row:hover .quick-actions in CSS.
      ────────────────────────────────────────────────────────────────────── */}
      <div
        className="quick-actions"
        style={{
          position: 'absolute',
          right: '48px',         /* leave space for the remove button in col 7 */
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          /* Gradient fade: transparent on left → white, so text underneath blends away */
          background: 'linear-gradient(to right, transparent 0%, #ffffff 28px)',
          paddingLeft: '32px',
          paddingRight: '4px',
          height: '100%',
          minHeight: '56px',
        }}
      >
        {/* Chart button */}
        <button
          type="button"
          className="qa-btn"
          title={`View ${symbol} chart`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChart?.(symbol);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </button>

        {/* Alert / Target button */}
        <button
          type="button"
          className="qa-btn"
          title={`Set alert for ${symbol}`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Buy button */}
        <button
          type="button"
          className="qa-btn qa-buy"
          title={`Buy ${symbol}`}
          onClick={(e) => e.stopPropagation()}
        >
          B
        </button>

        {/* Sell button */}
        <button
          type="button"
          className="qa-btn qa-sell"
          title={`Sell ${symbol}`}
          onClick={(e) => e.stopPropagation()}
        >
          S
        </button>
      </div>
    </div>
  );
};


// ── HoldingBadge ─────────────────────────────────────────────────────────────
// Sits below the symbol/NSE text in Col 1. Fully self-contained — no grid
// impact because it lives inside the existing Company column flex stack.

interface HoldingBadgeProps {
  qty: number;
}

const HoldingBadge: React.FC<HoldingBadgeProps> = ({ qty }) => (
  <span
    title={`In your holdings: ${qty} share${qty !== 1 ? 's' : ''}`}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: '1px 6px',
      borderRadius: '4px',
      backgroundColor: 'rgba(0, 208, 156, 0.10)',
      border: '1px solid rgba(0, 208, 156, 0.22)',
      fontSize: '11px',
      fontWeight: 500,
      color: '#00A87E',
      whiteSpace: 'nowrap',
      lineHeight: '16px',
      cursor: 'default',
      userSelect: 'none',
    }}
  >
    {/* Mini portfolio icon */}
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="4" width="10" height="7" rx="1" stroke="#00A87E" strokeWidth="1.3" />
      <path d="M4 4V3a2 2 0 0 1 4 0v1" stroke="#00A87E" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
    {qty.toLocaleString()} qty
  </span>
);

