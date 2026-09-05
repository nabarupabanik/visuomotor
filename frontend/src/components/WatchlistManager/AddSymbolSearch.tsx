import React, { useState, useEffect, useRef } from 'react';
import { watchlistService, StockSymbolCatalogDto } from '../../services/watchlistService';

interface AddSymbolSearchProps {
  onAddSymbol: (symbol: string) => Promise<void>;
  existingSymbols: string[];
}

export const AddSymbolSearch: React.FC<AddSymbolSearchProps> = ({ onAddSymbol, existingSymbols }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSymbolCatalogDto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const catalog = await watchlistService.searchCatalog(query);
        setResults(catalog);
        setIsOpen(true);
      } catch (err) {
        console.error('Failed to search catalog:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (symbol: string) => {
    try {
      await onAddSymbol(symbol);
      setQuery('');
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Search icon */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: 'absolute',
            left: '12px',
            color: '#AAACB8',
            pointerEvents: 'none',
            flexShrink: 0,
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => {
            if (query.trim()) setIsOpen(true);
            e.currentTarget.style.borderColor = 'rgba(0, 208, 156, 0.5)';
          }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E8E9EB'; }}
          placeholder="Search stocks to add (e.g. RELIANCE, TCS)..."
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E9EB',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
        {loading && (
          <span
            style={{
              position: 'absolute',
              right: '12px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            Searching...
          </span>
        )}
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 200,
            padding: '6px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E9EB',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No matching tickers found
            </div>
          ) : (
            results.map((item) => {
              const alreadyAdded = existingSymbols.includes(item.symbol);
              return (
                <div
                  key={item.symbol}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!alreadyAdded) handleSelect(item.symbol);
                  }}
                  onClick={() => !alreadyAdded && handleSelect(item.symbol)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    opacity: alreadyAdded ? 0.5 : 1,
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!alreadyAdded) e.currentTarget.style.backgroundColor = '#F4F5F7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {item.symbol}
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.67rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: '#F4F5F7',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {item.exchange}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>
                      {item.company_name}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {alreadyAdded ? (
                      <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>In Watchlist</span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.73rem',
                          color: '#00D09C',
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid rgba(0, 208, 156, 0.35)',
                          backgroundColor: 'rgba(0, 208, 156, 0.06)',
                        }}
                      >
                        + Add
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
