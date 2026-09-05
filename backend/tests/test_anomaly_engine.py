"""
Unit and integration tests for Slice 3: Anomaly Detection Engine and Tiered Fallbacks.
"""
import pytest
from backend.services.anomaly_engine import AnomalyEngine, get_anomaly_engine
from backend.services.fallback_service import FallbackService
from backend.batch.baseline_precomputer import precompute_baselines


def test_seasonality_threshold_decay():
    engine = AnomalyEngine("RELIANCE")

    # 9:15 AM (9.25): Peak open volatility threshold = 4.5σ
    thresh_open = engine._get_dynamic_threshold(9.25)
    assert thresh_open == 4.5

    # 9:30 AM (9.50): Mid-opening transition threshold = 3.75σ
    thresh_mid = engine._get_dynamic_threshold(9.50)
    assert thresh_mid == 3.75

    # 9:45 AM (9.75): Settled threshold = 3.0σ
    thresh_settled = engine._get_dynamic_threshold(9.75)
    assert thresh_settled == 3.0

    # 11:30 AM (11.50): Standard intraday threshold = 3.0σ
    thresh_regular = engine._get_dynamic_threshold(11.50)
    assert thresh_regular == 3.0


def test_anomaly_scoring_and_trigger_codes():
    engine = AnomalyEngine("TCS")

    # Feed normal stationary baseline ticks
    for _ in range(25):
        engine.score_tick(350000 + (_ % 3 * 10), 500, 11.0)

    # 1. Normal tick within cluster -> score low, tc = 0
    sc_norm, tc_norm, metrics_norm = engine.score_tick(350010, 500, 11.0)
    assert sc_norm < 0.65
    assert tc_norm == 0
    assert "day_high" in metrics_norm
    assert "vol_multiplier" in metrics_norm

    # 2. Volume spike anomaly (high volume ratio > 2.2)
    sc_spike, tc_spike, metrics_spike = engine.score_tick(355000, 25000, 11.0)
    assert sc_spike >= 0.5
    assert tc_spike in [1, 2, 3]
    assert metrics_spike["vol_multiplier"] > 2.0


def test_tiered_fallback_service():
    # Tier 2 static heuristic check
    baseline_info = FallbackService.get_symbol_baseline("INFY", "0915_0930", "large_cap")
    assert baseline_info["expected_atr_pct"] == 0.015
    assert baseline_info["tier"] in [1, 2]

    # Activate Tier 3 deterministic mode
    FallbackService.set_system_fallback_mode(True)
    baseline_tier3 = FallbackService.get_symbol_baseline("INFY", "0915_0930", "large_cap")
    assert baseline_tier3["tier"] == 3

    # Restore normal mode
    FallbackService.set_system_fallback_mode(False)


def test_precompute_baselines_run():
    res = precompute_baselines()
    assert res["status"] == "complete"
    assert "keys_written" in res
