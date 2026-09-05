import { api } from './authService';

export interface WatchlistItemDto {
  id: string;
  watchlist_id: string;
  symbol: string;
  display_order: number;
  added_at: string;
}

export interface WatchlistDto {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count: number;
  items?: WatchlistItemDto[];
}

export interface StockSymbolCatalogDto {
  symbol: string;
  company_name: string;
  exchange: string;
  asset_class: string;
  week_52_high: number | null;
  week_52_low: number | null;
}

export const watchlistService = {
  async listWatchlists(): Promise<WatchlistDto[]> {
    const res = await api.get<{ watchlists: WatchlistDto[] }>('/watchlists');
    return res.data.watchlists;
  },

  async createWatchlist(name: string): Promise<WatchlistDto> {
    const res = await api.post<{ message: string; watchlist: WatchlistDto }>('/watchlists', { name });
    return res.data.watchlist;
  },

  async getWatchlist(id: string): Promise<WatchlistDto> {
    const res = await api.get<{ watchlist: WatchlistDto }>(`/watchlists/${id}`);
    return res.data.watchlist;
  },

  async renameWatchlist(id: string, name: string): Promise<WatchlistDto> {
    const res = await api.put<{ message: string; watchlist: WatchlistDto }>(`/watchlists/${id}`, { name });
    return res.data.watchlist;
  },

  async deleteWatchlist(id: string): Promise<void> {
    await api.delete(`/watchlists/${id}`);
  },

  async listItems(watchlistId: string): Promise<WatchlistItemDto[]> {
    const res = await api.get<{ items: WatchlistItemDto[] }>(`/watchlists/${watchlistId}/items`);
    return res.data.items;
  },

  async addItem(watchlistId: string, symbol: string): Promise<WatchlistItemDto> {
    const res = await api.post<{ message: string; item: WatchlistItemDto }>(`/watchlists/${watchlistId}/items`, { symbol });
    return res.data.item;
  },

  async removeItem(watchlistId: string, symbol: string): Promise<void> {
    await api.delete(`/watchlists/${watchlistId}/items/${symbol}`);
  },

  async reorderItems(watchlistId: string, symbols: string[]): Promise<WatchlistItemDto[]> {
    const res = await api.put<{ message: string; items: WatchlistItemDto[] }>(`/watchlists/${watchlistId}/items/reorder`, { symbols });
    return res.data.items;
  },

  async searchCatalog(query: string = ''): Promise<StockSymbolCatalogDto[]> {
    const res = await api.get<{ catalog: StockSymbolCatalogDto[] }>(`/watchlists/catalog`, {
      params: { q: query },
    });
    return res.data.catalog;
  },
};
