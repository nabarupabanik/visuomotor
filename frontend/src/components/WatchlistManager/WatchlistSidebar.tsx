import React, { useState } from 'react';
import { WatchlistDto } from '../../services/watchlistService';

interface WatchlistTabsProps {
  watchlists: WatchlistDto[];
  activeWatchlistId: string | null;
  onSelectWatchlist: (id: string) => void;
  onCreateWatchlist: (name: string) => Promise<void>;
  onRenameWatchlist: (id: string, name: string) => Promise<void>;
  onDeleteWatchlist: (id: string) => Promise<void>;
}

export const WatchlistSidebar: React.FC<WatchlistTabsProps> = ({
  watchlists,
  activeWatchlistId,
  onSelectWatchlist,
  onCreateWatchlist,
  onRenameWatchlist,
  onDeleteWatchlist,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newWlName, setNewWlName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWlName.trim()) return;
    await onCreateWatchlist(newWlName.trim());
    setNewWlName('');
    setIsCreating(false);
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    await onRenameWatchlist(id, editingName.trim());
    setEditingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          borderBottom: '1px solid var(--border-subtle)',
          paddingLeft: '4px',
          backgroundColor: '#FFFFFF',
        }}
      >
        {watchlists.map((wl) => {
          const isActive = wl.id === activeWatchlistId;
          const isEditing = wl.id === editingId;

          return (
            <div
              key={wl.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleRename(wl.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(wl.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border-active)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    width: '120px',
                    backgroundColor: '#FFFFFF',
                    margin: '0 4px',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectWatchlist(wl.id)}
                  onDoubleClick={() => {
                    setEditingId(wl.id);
                    setEditingName(wl.name);
                  }}
                  title={`${wl.name} (double-click to rename)`}
                  style={{
                    padding: '12px 16px 10px',
                    background: 'none',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #00D09C' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#44475B' : '#7C7E8C',
                    transition: 'color 0.15s ease',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    position: 'relative',
                    top: '1px',         /* sit on the border-bottom line */
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#44475B';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#7C7E8C';
                  }}
                >
                  {wl.name}
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: isActive ? 'rgba(0,208,156,0.10)' : '#F4F5F7',
                      color: isActive ? '#00D09C' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {wl.items ? wl.items.length : wl.item_count}
                  </span>
                </button>
              )}

              {/* Delete button for non-single watchlists on active tab */}
              {isActive && watchlists.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteWatchlist(wl.id)}
                  title="Delete watchlist"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '0.7rem',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    lineHeight: 1,
                    marginLeft: '-8px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-red)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        {/* + Watchlist button */}
        {isCreating ? (
          <form
            onSubmit={handleCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}
          >
            <input
              type="text"
              autoFocus
              value={newWlName}
              onChange={(e) => setNewWlName(e.target.value)}
              placeholder="Watchlist name..."
              style={{
                padding: '5px 8px',
                border: '1px solid var(--border-active)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
                width: '130px',
                backgroundColor: '#FFFFFF',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '5px 10px',
                background: '#00D09C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              style={{
                padding: '5px 8px',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            style={{
              padding: '12px 14px 10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              color: '#00D09C',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            + Watchlist
          </button>
        )}
      </div>
    </div>
  );
};
