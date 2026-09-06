import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authService, UserProfile } from '../services/authService';
import { watchlistService, WatchlistDto } from '../services/watchlistService';
import { useSessionStore } from '../store/sessionStore';
import { useMarketStore } from '../store/marketStore';
import { useMarketStream } from '../hooks/useMarketStream';
import { useSessionCheckpoint } from '../hooks/useSessionCheckpoint';
import { WatchlistSidebar } from '../components/WatchlistManager/WatchlistSidebar';
import { AddSymbolSearch } from '../components/WatchlistManager/AddSymbolSearch';
import { TickerRow } from '../components/WatchlistList/TickerRow';
import { AlertCarousel } from '../components/AlertCarousel/AlertCarousel';
import { SortToggle } from '../components/WatchlistList/SortToggle';
import { useVolatilitySortedList } from '../hooks/useVolatilitySortedList';
import { useSummaryRequest } from '../hooks/useSummaryRequest';
import { CandlestickView } from '../components/AlertCarousel/CandlestickView';
import { formatPaise } from '../utils/formatters';

// ── Column sort types ─────────────────────────────────────────────────────────
type SortKey = 'company' | 'price' | 'oneDayChange' | 'change' | 'volume';
type SortDir = 'asc' | 'desc';
interface SortConfig { key: SortKey | null; dir: SortDir | null; }

/** Cycles: null → asc → desc → null */
function cycleSort(current: SortConfig, key: SortKey): SortConfig {
  if (current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc')  return { key, dir: 'desc' };
  return { key: null, dir: null };
}

interface WatchlistPageProps {
  onLogout: () => void;
}

// ── Mock global indices ──────────────────────────────────────────────────────
const MOCK_INDICES = [
  { name: 'NIFTY',      price: '23,897.70', change: '+24.25',  pct: '+0.10%', up: true  },
  { name: 'SENSEX',     price: '76,515.43', change: '+362.57', pct: '+0.48%', up: true  },
  { name: 'BANKNIFTY',  price: '57,369.65', change: '-10.95',  pct: '-0.02%', up: false },
  { name: 'MIDCPNIFTY', price: '14,713.65', change: '-46.35',  pct: '-0.31%', up: false },
  { name: 'FINNIFTY',   price: '26,051.00', change: '+112.30', pct: '+0.43%', up: true  },
];

// ── User holdings (symbol → quantity) ────────────────────────────────────────
// Replace this with a real API call (e.g. GET /api/portfolio/holdings) once
// the holdings endpoint is available. TickerRow reads this as a pure prop —
// no Zustand changes required.
const MOCK_USER_HOLDINGS: Record<string, number> = {
  RELIANCE:   15,
  TCS:        8,
  HDFCBANK:   20,
  INFY:       12,
  ASIANPAINT: 5,
};

export const WatchlistPage: React.FC<WatchlistPageProps> = ({ onLogout }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [watchlists, setWatchlists] = useState<WatchlistDto[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [chartModalSymbol, setChartModalSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (!chartModalSymbol) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChartModalSymbol(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chartModalSymbol]);

  const setWatchlistSymbols = useSessionStore((state) => state.setWatchlistSymbols);
  const setActiveWatchlistIdInStore = useSessionStore((state) => state.setActiveWatchlistId);

  const handleLogoutClick = useCallback(() => {
    const currentUserId = useSessionStore.getState().userId;
    if (currentUserId) {
      localStorage.removeItem('wl_exit_snapshot_' + currentUserId);
    }
    useMarketStore.getState().setAlerts([]); // Wipe the UI state
    onLogout();
  }, [onLogout]);

  // Load user and watchlists
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userRes = await authService.getMe();
      setUser(userRes.user);

      const wlList = await watchlistService.listWatchlists();
      setWatchlists(wlList);

      if (wlList.length > 0) {
        const initialWl = wlList[0];
        setActiveWatchlistId(initialWl.id);
        setActiveWatchlistIdInStore(initialWl.id);
        const symbols = (initialWl.items || []).map((i) => i.symbol);
        setWatchlistSymbols(symbols);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load watchlist data.');
      if (err.response?.status === 401) {
        handleLogoutClick();
      }
    } finally {
      setLoading(false);
    }
  }, [handleLogoutClick, setActiveWatchlistIdInStore, setWatchlistSymbols]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeWatchlist = watchlists.find((w) => w.id === activeWatchlistId);
  const activeItems = activeWatchlist?.items || [];
  const existingSymbols = activeItems.map((i) => i.symbol);

  // Hook up cross-device session checkpoint sync
  useSessionCheckpoint();

  // Hook up real-time SSE stream for active watchlist
  useMarketStream({ symbols: existingSymbols, enabled: existingSymbols.length > 0 });

  const connectionStatus = useMarketStore((state) => state.connectionStatus);

  // ── Volatility sort vs custom sort (existing) ─────────────────────────────
  const [sortBy, setSortBy] = useState<'volatility' | 'custom'>('custom');
  const sortedItems = useVolatilitySortedList(activeItems, sortBy);

  // ── Column header sort state ──────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, dir: null });

  const handleColumnSort = useCallback((key: SortKey) => {
    setSortConfig((prev) => cycleSort(prev, key));
  }, []);

  // Subscribe to live ticks snapshot + checkpoint for sort comparators.
  // Using shallow-equal selector on the whole ticks map so we only re-derive
  // the sorted list when a tick actually changes — not on every render.
  const ticks      = useMarketStore((state) => state.ticks);
  const checkpoint = useSessionStore((state) => state.checkpoint);

  // ── memoized column-sorted list ──────────────────────────────────────────
  // Runs AFTER useVolatilitySortedList so column sort is a secondary layer.
  // When sortConfig.key is null it returns the list unchanged (preserving
  // volatility / custom order), so the existing UX is completely unaffected.
  const columnSortedItems = useMemo(() => {
    if (!sortConfig.key) return sortedItems;

    const dir = sortConfig.dir === 'asc' ? 1 : -1;

    return [...sortedItems].sort((a, b) => {
      switch (sortConfig.key) {
        // ── Company: alphabetical by symbol ───────────────────────────
        case 'company':
          return dir * a.symbol.localeCompare(b.symbol);

        // ── Mkt price: ltp in paise (integer) ─────────────────────────
        case 'price': {
          const pa = ticks[a.symbol]?.ltp ?? null;
          const pb = ticks[b.symbol]?.ltp ?? null;
          // Nulls always sink to the bottom regardless of direction
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return dir * (pa - pb);
        }

        // ── 1D change: relative to previousClose ───────────────────────
        case 'oneDayChange': {
          const calc1D = (symbol: string): number | null => {
            const tick = ticks[symbol];
            const ltp = tick?.ltp;
            const pc = tick?.previousClose;
            if (!pc || pc <= 0 || !ltp) return null;
            return ((ltp - pc) / pc) * 10000;
          };
          const da = calc1D(a.symbol);
          const db = calc1D(b.symbol);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return dir * (da - db);
        }

        // ── Change (since exit): basis points derived from checkpoint ──
        case 'change': {
          const prices = checkpoint?.last_seen_prices ?? {};
          const calcBps = (symbol: string): number | null => {
            const last = prices[symbol];
            const ltp  = ticks[symbol]?.ltp;
            if (!last || last <= 0 || !ltp) return null;
            return ((ltp - last) / last) * 10000;
          };
          const da = calcBps(a.symbol);
          const db = calcBps(b.symbol);
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return dir * (da - db);
        }

        // ── Volume: raw integer ────────────────────────────────────────
        case 'volume': {
          const va = ticks[a.symbol]?.volume ?? null;
          const vb = ticks[b.symbol]?.volume ?? null;
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          return dir * (va - vb);
        }

        default:
          return 0;
      }
    });
  }, [sortedItems, sortConfig, ticks, checkpoint]);

  // Progressive AI summary coordination
  const { retrySummary } = useSummaryRequest();

  // Filter by watchlist search input (applied last, on top of column sort)
  const filteredItems = watchlistSearch.trim()
    ? columnSortedItems.filter((item) =>
        item.symbol.toLowerCase().includes(watchlistSearch.trim().toLowerCase())
      )
    : columnSortedItems;

  // Switch watchlist
  const handleSelectWatchlist = (id: string) => {
    setActiveWatchlistId(id);
    setActiveWatchlistIdInStore(id);
    const selected = watchlists.find((w) => w.id === id);
    if (selected) {
      const symbols = (selected.items || []).map((i) => i.symbol);
      setWatchlistSymbols(symbols);
    }
  };

  // Create watchlist
  const handleCreateWatchlist = async (name: string) => {
    try {
      const created = await watchlistService.createWatchlist(name);
      setWatchlists((prev) => [...prev, created]);
      handleSelectWatchlist(created.id);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create watchlist');
    }
  };

  // Rename watchlist
  const handleRenameWatchlist = async (id: string, name: string) => {
    try {
      const renamed = await watchlistService.renameWatchlist(id, name);
      setWatchlists((prev) => prev.map((w) => (w.id === id ? { ...w, name: renamed.name } : w)));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to rename watchlist');
    }
  };

  // Delete watchlist
  const handleDeleteWatchlist = async (id: string) => {
    if (!confirm('Are you sure you want to delete this watchlist?')) return;
    try {
      await watchlistService.deleteWatchlist(id);
      const remaining = watchlists.filter((w) => w.id !== id);
      setWatchlists(remaining);
      if (remaining.length > 0) {
        handleSelectWatchlist(remaining[0].id);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete watchlist');
    }
  };

  // Add symbol to active watchlist
  const handleAddSymbol = async (symbol: string) => {
    if (!activeWatchlistId) return;
    try {
      const addedItem = await watchlistService.addItem(activeWatchlistId, symbol);
      setWatchlists((prev) =>
        prev.map((w) => {
          if (w.id === activeWatchlistId) {
            const updatedItems = [...(w.items || []), addedItem];
            return { ...w, items: updatedItems, item_count: updatedItems.length };
          }
          return w;
        })
      );
      setWatchlistSymbols([...existingSymbols, symbol]);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add symbol');
    }
  };

  // Remove symbol from active watchlist
  const handleRemoveSymbol = async (symbol: string) => {
    if (!activeWatchlistId) return;
    try {
      await watchlistService.removeItem(activeWatchlistId, symbol);
      setWatchlists((prev) =>
        prev.map((w) => {
          if (w.id === activeWatchlistId) {
            const updatedItems = (w.items || []).filter((i) => i.symbol !== symbol);
            return { ...w, items: updatedItems, item_count: updatedItems.length };
          }
          return w;
        })
      );
      setWatchlistSymbols(existingSymbols.filter((s) => s !== symbol));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to remove symbol');
    }
  };

  // Reorder symbols
  const handleMoveSymbol = async (index: number, direction: 'up' | 'down') => {
    if (!activeWatchlistId || !activeWatchlist) return;
    const items = [...activeItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Swap
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    const newSymbolsOrder = items.map((i) => i.symbol);
    try {
      const reordered = await watchlistService.reorderItems(activeWatchlistId, newSymbolsOrder);
      setWatchlists((prev) =>
        prev.map((w) => (w.id === activeWatchlistId ? { ...w, items: reordered } : w))
      );
      setWatchlistSymbols(newSymbolsOrder);
    } catch (err: any) {
      console.error('Failed to reorder symbols:', err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F5F6F9' }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE A: Main Top Navigation Bar (Groww-style white bar)
      ══════════════════════════════════════════════════════════════════════════ */}
      <header
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E8E9EB',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 60,
          gap: '16px',
        }}
      >
        {/* Left: Logo + Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          {/* Groww Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '32px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00D09C 0%, #00B386 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {/* Simple "G" logo mark */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.52 0 10-4.48 10-10S17.52 2 12 2zm3 13h-4v-2h2v-2h-2c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h4v2h-4v2h2c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2z" fill="white"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#44475B', letterSpacing: '-0.02em' }}>
              Groww
            </span>
          </div>

          {/* Nav links */}
          {['Stocks', 'F&O', 'Mutual Funds'].map((link) => (
            <button
              key={link}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 14px',
                height: '56px',
                fontSize: '0.88rem',
                fontWeight: 500,
                color: '#7C7E8C',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#44475B'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#7C7E8C'; }}
            >
              {link}
            </button>
          ))}
        </div>

        {/* Center: Global Search */}
        <div
          style={{
            flex: 1,
            maxWidth: '420px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            backgroundColor: '#F4F5F7',
            border: '1px solid #E8E9EB',
            borderRadius: '8px',
            cursor: 'text',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AAACB8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span style={{ fontSize: '0.85rem', color: '#AAACB8', flex: 1 }}>Search Groww...</span>
          <span
            style={{
              fontSize: '0.7rem',
              color: '#AAACB8',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #E8E9EB',
              backgroundColor: '#FFFFFF',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Ctrl+K
          </span>
        </div>

        {/* Right: Connection Status + Bell + Avatar + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Live feed pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '16px',
              backgroundColor:
                connectionStatus === 'connected'
                  ? 'rgba(0, 208, 156, 0.08)'
                  : connectionStatus === 'connecting'
                  ? 'rgba(255, 176, 32, 0.08)'
                  : 'rgba(235, 91, 60, 0.08)',
              border: `1px solid ${
                connectionStatus === 'connected'
                  ? 'rgba(0, 208, 156, 0.25)'
                  : connectionStatus === 'connecting'
                  ? 'rgba(255, 176, 32, 0.25)'
                  : 'rgba(235, 91, 60, 0.25)'
              }`,
              fontSize: '0.73rem',
              color:
                connectionStatus === 'connected'
                  ? '#00D09C'
                  : connectionStatus === 'connecting'
                  ? 'var(--color-amber)'
                  : 'var(--color-red)',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor:
                  connectionStatus === 'connected'
                    ? '#00D09C'
                    : connectionStatus === 'connecting'
                    ? 'var(--color-amber)'
                    : 'var(--color-red)',
              }}
            />
            {connectionStatus === 'connected'
              ? 'Live'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Offline'}
          </div>

          {/* Notification Bell */}
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#7C7E8C',
              padding: '4px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F4F5F7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Notifications"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>

          {/* User avatar */}
          <div
            title={user?.email || 'User Account'}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00D09C, #00B386)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {user?.email ? user.email.trim()[0].toUpperCase() : 'U'}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogoutClick}
            title="Log Out"
            style={{
              background: 'transparent',
              border: '1px solid #E8E9EB',
              color: '#7C7E8C',
              padding: '5px 12px',
              borderRadius: '16px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#44475B';
              e.currentTarget.style.borderColor = '#AAACB8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#7C7E8C';
              e.currentTarget.style.borderColor = '#E8E9EB';
            }}
          >
            Log Out
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE B: Global Indices Ticker Bar
      ══════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E8E9EB',
          padding: '0 16px',
          height: '38px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '4px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {MOCK_INDICES.map((idx) => (
          <div
            key={idx.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#44475B' }}>
              {idx.name}
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#44475B' }}>
              {idx.price}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 500,
                color: idx.up ? '#00D09C' : '#EB5B3C',
              }}
            >
              {idx.change} ({idx.pct})
            </span>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE C: Page-level nav (Explore / Holdings / Positions / Watchlist)
      ══════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E8E9EB',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '0',
        }}
      >
        {['Explore', 'Holdings', 'Positions', 'Orders', 'Watchlist'].map((tab) => {
          const isActiveTab = tab === 'Watchlist';
          return (
            <button
              key={tab}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '13px 16px 11px',
                fontSize: '0.88rem',
                fontWeight: isActiveTab ? 700 : 500,
                color: isActiveTab ? '#44475B' : '#7C7E8C',
                borderBottom: isActiveTab ? '2px solid #44475B' : '2px solid transparent',
                transition: 'color 0.15s ease',
                position: 'relative',
                top: '1px',
              }}
              onMouseEnter={(e) => { if (!isActiveTab) e.currentTarget.style.color = '#44475B'; }}
              onMouseLeave={(e) => { if (!isActiveTab) e.currentTarget.style.color = '#7C7E8C'; }}
            >
              {tab}
            </button>
          );
        })}
        {/* Terminal button on right */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            style={{
              background: 'none',
              border: '1px solid #E8E9EB',
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 500,
              color: '#7C7E8C',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Terminal
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE D: Main Content Body
      ══════════════════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: '0', minHeight: 0 }}>

        {/* White container card wrapping the entire watchlist area */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E9EB',
            borderRadius: '12px 12px 0 0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            flex: 1,
          }}
        >

          {/* ── D1: Watchlist Tab Bar ─────────────────────────────────────── */}
          <WatchlistSidebar
            watchlists={watchlists}
            activeWatchlistId={activeWatchlistId}
            onSelectWatchlist={handleSelectWatchlist}
            onCreateWatchlist={handleCreateWatchlist}
            onRenameWatchlist={handleRenameWatchlist}
            onDeleteWatchlist={handleDeleteWatchlist}
          />

          {/* ── D2: Action Bar ────────────────────────────────────────────── */}
          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderBottom: '1px solid #E8E9EB',
              flexWrap: 'nowrap',
            }}
          >
            {/* Left: Watchlist search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                border: '1px solid #E8E9EB',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                width: '260px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAACB8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={watchlistSearch}
                onChange={(e) => setWatchlistSearch(e.target.value)}
                placeholder="Search your watchlist"
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  backgroundColor: 'transparent',
                  width: '100%',
                }}
              />
            </div>

            {/* Right: Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Volatility Triage + Custom Order */}
              <SortToggle sortBy={sortBy} onChange={setSortBy} />

              {/* Divider */}
              <div style={{ width: '1px', height: '20px', backgroundColor: '#E8E9EB' }} />

              {/* Add stocks */}
              <AddSymbolSearch
                onAddSymbol={handleAddSymbol}
                existingSymbols={existingSymbols}
              />
            </div>
          </div>

          {/* ── D3: Meaningful Changes Carousel (Zone 1) ──────────────────── */}
          {/* Only shown when there are alerts */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E9EB' }}>
            <AlertCarousel onRetrySummary={retrySummary} />
          </div>

          {/* ── D4: Sticky Table Header ───────────────────────────────────── */}
          <div
            className="wl-table-grid"
            style={{
              padding: '10px 20px',
              backgroundColor: '#F4F5F7',
              borderBottom: '1px solid #E8E9EB',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            {/* Col 1: Company — left-aligned, sortable */}
            <SortableHeader
              label={`Company (${filteredItems.length})`}
              sortKey="company"
              justify="flex-start"
              sortConfig={sortConfig}
              onClick={handleColumnSort}
            />

            {/* Col 2: Trend — centre-aligned, not sortable */}
            <div style={{ ...colHeaderStyle, justifySelf: 'center' }}>Trend</div>

            {/* Col 3: Mkt price — right-aligned, sortable */}
            <SortableHeader
              label="Mkt price"
              sortKey="price"
              justify="flex-end"
              sortConfig={sortConfig}
              onClick={handleColumnSort}
            />

            {/* Col 4: 1D change — right-aligned, sortable */}
            <SortableHeader
              label="1D change"
              sortKey="oneDayChange"
              justify="flex-end"
              sortConfig={sortConfig}
              onClick={handleColumnSort}
            />

            {/* Col 5: Change (since exit) — right-aligned, sortable */}
            <SortableHeader
              label="Change (since exit)"
              sortKey="change"
              justify="flex-end"
              sortConfig={sortConfig}
              onClick={handleColumnSort}
            />

            {/* Col 5: Volume — right-aligned, sortable */}
            <SortableHeader
              label="Volume"
              sortKey="volume"
              justify="flex-end"
              sortConfig={sortConfig}
              onClick={handleColumnSort}
            />

            {/* Col 6: 52W perf — right-aligned, not sortable */}
            <div style={{ ...colHeaderStyle, justifySelf: 'flex-end' }}>52W perf</div>

            {/* Col 7: Actions — empty */}
            <div />
          </div>

          {/* ── D5: Ticker Rows ───────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
                Loading watchlist items...
              </div>
            ) : error ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#EB5B3C' }}>
                {error}
              </div>
            ) : activeItems.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  No stocks in this watchlist
                </div>
                <div style={{ fontSize: '0.82rem' }}>
                  Use the search bar above to add liquid stocks from the catalog.
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔍</div>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                  No stocks match "{watchlistSearch}"
                </div>
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <TickerRow
                  key={item.id}
                  symbol={item.symbol}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === filteredItems.length - 1}
                  onMoveUp={() => handleMoveSymbol(idx, 'up')}
                  onMoveDown={() => handleMoveSymbol(idx, 'down')}
                  onRemove={() => handleRemoveSymbol(item.symbol)}
                  holdings={MOCK_USER_HOLDINGS}
                  onOpenChart={(sym) => setChartModalSymbol(sym)}
                />
              ))
            )}
          </div>
        </div>
      </main>

      {/* ── Candlestick Chart Modal for Watchlist Table Rows ───────────────── */}
      {chartModalSymbol && (() => {
        const modalTick = ticks[chartModalSymbol];
        const modalCurrentPrice = modalTick?.ltp;
        const modalBaselinePrice =
          checkpoint?.last_seen_prices?.[chartModalSymbol] ??
          useSessionStore.getState().checkpoint?.last_seen_prices?.[chartModalSymbol] ??
          modalCurrentPrice;
        const modalPreviousClose = modalTick?.previousClose;

        const modalDeltaBps =
          modalBaselinePrice && modalBaselinePrice > 0 && modalCurrentPrice
            ? Math.round(((modalCurrentPrice - modalBaselinePrice) / modalBaselinePrice) * 10000)
            : 0;
        const modalDeltaPercent = (modalDeltaBps / 100).toFixed(2);
        const modalIsPositive = modalDeltaBps >= 0;

        let modal1DText: string | null = null;
        let modal1DPositive = false;
        if (modalCurrentPrice && modalPreviousClose && modalPreviousClose > 0) {
          const diff = modalCurrentPrice - modalPreviousClose;
          const absRupees = (Math.abs(diff) / 100).toFixed(2);
          const pct = ((diff / modalPreviousClose) * 100).toFixed(2);
          modal1DPositive = diff >= 0;
          const sign = modal1DPositive ? '+' : '-';
          modal1DText = `${sign}₹${absRupees} (${sign}${Math.abs(Number(pct)).toFixed(2)}%)`;
        }

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setChartModalSymbol(null)}
          >
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                width: '800px',
                maxWidth: '95vw',
                padding: '24px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                border: '1px solid #E8E8E8',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #F0F0F0',
                  paddingBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: 700,
                        color: '#121212',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {chartModalSymbol}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#F5F5F5',
                        color: '#7C7E8C',
                        border: '1px solid #E8E8E8',
                      }}
                    >
                      NSE
                    </span>
                  </div>

                  {/* Price & Change Details */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: '#121212',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {modalCurrentPrice ? formatPaise(modalCurrentPrice) : '₹0.00'}
                    </span>

                    {/* 1D Change Badge */}
                    {modal1DText && (
                      <span
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: modal1DPositive ? '#00D09C' : '#EB5B3C',
                        }}
                      >
                        1D: {modal1DText}
                      </span>
                    )}

                    {/* Change Since Exit */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          color: modalIsPositive ? '#00D09C' : '#EB5B3C',
                        }}
                      >
                        ({modalIsPositive ? `+${modalDeltaPercent}` : modalDeltaPercent}%)
                      </span>
                      {modalBaselinePrice ? (
                        <span style={{ fontSize: '0.74rem', color: '#7C7E8C', fontWeight: 500 }}>
                          since exit ({formatPaise(modalBaselinePrice)})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Close "X" Button */}
                <button
                  type="button"
                  onClick={() => setChartModalSymbol(null)}
                  title="Close chart"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#7C7E8C',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                    e.currentTarget.style.color = '#121212';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#7C7E8C';
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Modal Body: Candlestick View */}
              <CandlestickView
                symbol={chartModalSymbol}
                currentPrice={modalCurrentPrice}
                baselinePrice={modalBaselinePrice}
                previousClose={modalPreviousClose}
                height={360}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const colHeaderStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: '#7C7E8C',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

/** Double-caret ↕ — shown when column is not actively sorted */
const DoubleCaret: React.FC = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0, display: 'block' }}>
    <path d="M5 1L1.5 5h7L5 1z" fill="#AAACB8" />
    <path d="M5 13L8.5 9h-7L5 13z" fill="#AAACB8" />
  </svg>
);

/** Single up-arrow — shown when column sorted asc */
const ArrowUp: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0, display: 'block' }}>
    <path d="M5 1L1 6h3v5h2V6h3L5 1z" fill={color} />
  </svg>
);

/** Single down-arrow — shown when column sorted desc */
const ArrowDown: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0, display: 'block' }}>
    <path d="M5 11L9 6H6V1H4v5H1L5 11z" fill={color} />
  </svg>
);




interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  justify: 'flex-start' | 'flex-end' | 'center';
  sortConfig: SortConfig;
  onClick: (key: SortKey) => void;
}

/** Clickable sortable column header — visually reflects active/inactive sort state */
const SortableHeader: React.FC<SortableHeaderProps> = ({ label, sortKey, justify, sortConfig, onClick }) => {
  const isActive = sortConfig.key === sortKey;
  const activeColor = '#44475B';
  const idleColor   = '#7C7E8C';
  const color = isActive ? activeColor : idleColor;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(sortKey)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(sortKey); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        justifySelf: justify,
        gap: '4px',
        cursor: 'pointer',
        color,
        fontSize: '13px',
        fontWeight: isActive ? 600 : 500,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        transition: 'color 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = activeColor; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = idleColor; }}
    >
      <span>{label}</span>
      {isActive && sortConfig.dir === 'asc'  && <ArrowUp   color="#00D09C" />}
      {isActive && sortConfig.dir === 'desc' && <ArrowDown color="#00D09C" />}
      {!isActive && <DoubleCaret />}
    </div>
  );
};

