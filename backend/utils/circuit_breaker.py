"""
Circuit Breaker utility for external third-party API dependencies (News API, LLM).
Configured with pybreaker: fail_max=5, reset_timeout=300 (5 minutes cooldown).
"""
import pybreaker
from ..config import get_config

config = get_config()

class CircuitBreakerListener(pybreaker.CircuitBreakerListener):
    def state_change(self, cb, old_state, new_state):
        print(f"[CIRCUIT_BREAKER] State change: {old_state.name} -> {new_state.name}")

    def failure(self, cb, exc):
        print(f"[CIRCUIT_BREAKER] Failure recorded: {exc}")

    def success(self, cb):
        pass


news_circuit_breaker = pybreaker.CircuitBreaker(
    fail_max=config.CIRCUIT_BREAKER_FAIL_MAX,
    reset_timeout=config.CIRCUIT_BREAKER_RESET_TIMEOUT,
    listeners=[CircuitBreakerListener()],
    name="NewsAPIBreaker",
)
