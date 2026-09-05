"""
Anomaly Detection Engine.
Hybrid real-time classification: Z-Score (Layer 1) + Isolation Forest (Layer 2).
Includes the 9:15 AM Opening Auction Seasonality Rule to suppress false positives during opening volatility.
"""
from collections import deque
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import Tuple, Dict, Optional, Any


class AnomalyEngine:
    """
    Hybrid detection engine fitted on rolling intraday tick windows per symbol.
    """

    def __init__(self, symbol: str, window_size: int = 200, n_estimators: int = 50):
        self.symbol = symbol
        self.window = deque(maxlen=window_size)
        self.iso_forest = IsolationForest(
            n_estimators=n_estimators,
            contamination=0.05,
            random_state=42,
            n_jobs=1,
        )
        self._is_fitted = False
        self.day_high = 0
        self.day_low = float('inf')

    def score_tick(self, price: float, volume: float, tod_hour: float) -> Tuple[float, int, Dict[str, Any]]:
        """
        Calculates (anomaly_score: float [0.0-1.0], trigger_code: int [0-5], metrics: dict).
        """
        price_int = int(price)
        self.day_high = max(self.day_high, price_int)
        if self.day_low == float('inf') or price_int < self.day_low:
            self.day_low = price_int

        self.window.append([price, volume])

        default_metrics = {
            "vol_multiplier": 1.0,
            "z_score": 0.0,
            "day_high": self.day_high,
            "day_low": self.day_low if self.day_low != float('inf') else price_int,
        }

        # Need minimum 15 ticks for statistical variance
        if len(self.window) < 15:
            return 0.0, 0, default_metrics

        arr = np.array(self.window)

        # ── Layer 1: Z-Score ──────────────────────────────────────────────────
        sample_slice = arr[-min(len(arr), 50):, 0]
        mu, sigma = sample_slice.mean(), sample_slice.std()
        z_threshold = self._get_dynamic_threshold(tod_hour)
        signed_z = (price - mu) / (sigma + 1e-9)
        abs_z = abs(signed_z)

        # ── Layer 2: Isolation Forest ─────────────────────────────────────────
        if not self._is_fitted or len(self.window) % 25 == 0:
            try:
                self.iso_forest.fit(arr)
                self._is_fitted = True
            except Exception:
                pass

        iso_score = 0.0
        if self._is_fitted:
            try:
                # -decision_function: higher value = more anomalous
                raw_decision = self.iso_forest.decision_function([[price, volume]])[0]
                iso_score = max(0.0, min(1.0, -raw_decision + 0.5))
            except Exception:
                iso_score = 0.0

        # Combined continuous score normalized to [0.0, 1.0]
        z_normalized = min(abs_z / (z_threshold + 1e-9), 1.0)
        combined_score = round(float(min(1.0, (z_normalized * 0.6) + (iso_score * 0.4))), 3)

        # ── Trigger Code Classification ───────────────────────────────────────
        avg_volume = arr[:, 1].mean()
        trigger_code = 0
        if combined_score >= 0.65 or abs_z >= z_threshold:
            trigger_code = self._classify(signed_z, volume, avg_volume)

        vol_multiplier = round(float(volume / (avg_volume + 1e-9)), 2)
        metrics = {
            "vol_multiplier": vol_multiplier,
            "z_score": round(float(signed_z), 2),
            "day_high": self.day_high,
            "day_low": self.day_low if self.day_low != float('inf') else price_int,
        }

        return combined_score, trigger_code, metrics

    def _get_dynamic_threshold(self, hour: float) -> float:
        """
        9:15 AM Seasonality Rule:
        Between 9:15 (9.25) and 9:45 (9.75), widen Z-score threshold from 4.5σ down to 3.0σ.
        Prevents false alarms during opening price discovery.
        """
        if 9.25 <= hour <= 9.75:
            decay = (hour - 9.25) / 0.5   # 0.0 at 9:15 AM, 1.0 at 9:45 AM
            return 4.5 - (1.5 * decay)    # 4.5σ -> 3.0σ
        return 3.0

    def _classify(self, signed_z: float, volume: float, avg_volume: float) -> int:
        vol_ratio = volume / (avg_volume + 1e-9)
        if vol_ratio >= 2.2:
            return 1  # Volume Spike
        if signed_z <= -3.2:
            return 2  # Price Plunge
        if signed_z >= 3.2:
            return 3  # Volatility Breakout
        return 3


# Cache of anomaly engines per symbol
_engines: Dict[str, AnomalyEngine] = {}

def get_anomaly_engine(symbol: str) -> AnomalyEngine:
    if symbol not in _engines:
        _engines[symbol] = AnomalyEngine(symbol)
    return _engines[symbol]
