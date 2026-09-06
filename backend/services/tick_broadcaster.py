"""
Tick Broadcaster Service.
Simulates realistic high-frequency market ticks for active watchlist symbols.
Publishes to Redis pub/sub channel 'channel:ticks' and caches latest tick per symbol in Redis.
Supports in-memory fallback if Redis is temporarily unreachable.
"""
import json
import time
import random
import threading
from typing import Generator, Dict, Any, Optional
from ..extensions import redis_client
from ..utils.redis_keys import tick_latest, TICKS_CHANNEL

# Initial base prices in paise (e.g. ₹2,485.50 -> 248550 paise)
BASE_PRICES: Dict[str, int] = {
    "RELIANCE": 248500,
    "TCS": 395000,
    "HDFCBANK": 165000,
    "INFY": 182000,
    "ICICIBANK": 121000,
    "BHARTIARTL": 152000,
    "ITC": 49000,
    "SBIN": 81000,
    "LT": 355000,
    "TATAMOTORS": 98000,
    "BAJFINANCE": 710000,
    "ZOMATO": 26500,
    "ASIANPAINT": 289000,
}

import datetime
from .anomaly_engine import get_anomaly_engine

class TickBroadcaster:
    def __init__(self):
        self.current_prices = dict(BASE_PRICES)
        self.running = False
        self._subscribers = set()
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None

    def ensure_symbol(self, symbol: str) -> int:
        """
        Ensures a newly added symbol is active in current_prices.
        Derives baseline from 52-week midpoint or default.
        """
        if symbol in self.current_prices:
            return self.current_prices[symbol]

        price = 150000
        try:
            from ..models.stock_symbols import StockSymbol
            from ..extensions import db
            sym_obj = db.session.get(StockSymbol, symbol)
            if sym_obj and sym_obj.week_52_high and sym_obj.week_52_low:
                price = int((sym_obj.week_52_high + sym_obj.week_52_low) / 2)
        except Exception:
            pass

        self.current_prices[symbol] = price
        return price

    def get_previous_close(self, symbol: str) -> int:
        if symbol in BASE_PRICES:
            return BASE_PRICES[symbol]
        if symbol not in self.current_prices:
            return self.ensure_symbol(symbol)
        return self.current_prices.get(symbol, 100000)

    def get_latest_price(self, symbol: str) -> int:
        if symbol not in self.current_prices:
            return self.ensure_symbol(symbol)
        return self.current_prices.get(symbol, 100000)

    def generate_tick(self, symbol: str) -> Dict[str, Any]:
        """
        Generate a single simulated tick with drift and micro-fluctuation,
        scored through the AnomalyEngine (Z-Score + Isolation Forest).
        """
        base = self.current_prices.get(symbol, 100000)
        prev_close = self.get_previous_close(symbol)

        # 5% chance of simulated market anomaly for demonstration
        is_spike = random.random() < 0.05
        if is_spike:
            direction = 1 if random.random() > 0.4 else -1
            pct_change = direction * random.uniform(0.025, 0.045)  # 2.5% - 4.5% move
            volume = random.randint(15000, 45000)                  # volume surge
        else:
            pct_change = random.gauss(0.0001, 0.0018)
            volume = random.randint(50, 4500)

        new_price = max(100, int(base * (1 + pct_change)))
        self.current_prices[symbol] = new_price

        now = datetime.datetime.now()
        tod_hour = now.hour + (now.minute / 60.0)
        now_epoch = int(now.timestamp())

        # Real-time anomaly scoring
        engine = get_anomaly_engine(symbol)
        sc, tc, metrics = engine.score_tick(new_price, volume, tod_hour)
        metrics["previous_close"] = prev_close

        # Payload matching design.md §7.2:
        # s: symbol, p: price in paise, v: volume, sc: anomaly score, tc: trigger code
        tick = {
            "s": symbol,
            "p": new_price,
            "v": volume,
            "sc": sc,
            "tc": tc,
            "sparklineTs": now_epoch,
            "prevClose": prev_close,
            "metrics": metrics,
        }
        return tick

    def publish_tick(self, tick: Dict[str, Any]) -> None:
        symbol = tick["s"]
        tick_json = json.dumps(tick)

        # 1. Update Redis cache with 10s TTL
        try:
            redis_client.set(tick_latest(symbol), tick_json, ex=10)
            redis_client.publish(TICKS_CHANNEL, tick_json)
        except Exception:
            # Non-fatal if Redis is not running locally
            pass

        # 2. In-memory distribution to connected SSE clients
        with self._lock:
            for sub in list(self._subscribers):
                try:
                    sub(tick)
                except Exception:
                    pass

    def subscribe(self, callback) -> None:
        with self._lock:
            self._subscribers.add(callback)

    def unsubscribe(self, callback) -> None:
        with self._lock:
            self._subscribers.discard(callback)

    def _loop(self) -> None:
        symbols = list(self.current_prices.keys())
        while self.running:
            # Pick a batch of 2-4 random symbols per cycle
            chosen = random.sample(symbols, k=min(4, len(symbols)))
            for sym in chosen:
                tick = self.generate_tick(sym)
                self.publish_tick(tick)
            time.sleep(0.5)  # 2Hz broadcast cadence

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self.running = False


# Singleton broadcaster
broadcaster = TickBroadcaster()
