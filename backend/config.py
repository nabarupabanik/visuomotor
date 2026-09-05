"""
Configuration classes for different environments.

Usage:
    app.config.from_object(get_config("development"))
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

# Find and load .env from project root
_root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(_root_env):
    load_dotenv(_root_env, override=True)
else:
    load_dotenv(override=True)

_raw_db_url = os.environ.get("DATABASE_URL", "")
if _raw_db_url.startswith("postgresql+asyncpg://"):
    _raw_db_url = _raw_db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
elif not _raw_db_url:
    _raw_db_url = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'visuomotor.db')}"


class BaseConfig:
    """Shared settings across all environments."""
    SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION")
    JWT_SECRET_KEY: str = SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 60))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 30))
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI: str = _raw_db_url

    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # Flask-SSE uses Redis for pub/sub
    REDIS_URL_SSE: str = REDIS_URL

    # APScheduler
    SCHEDULER_API_ENABLED = False

    # News API
    NEWS_API_KEY: str = os.environ.get("NEWS_API_KEY", "")
    NEWS_API_BASE_URL: str = os.environ.get(
        "NEWS_API_BASE_URL", "https://api.marketaux.com/v1"
    )

    # OpenAI / LLM
    OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    # PagerDuty
    PAGERDUTY_ROUTING_KEY: str = os.environ.get("PAGERDUTY_ROUTING_KEY", "")

    # Anomaly detection tuning
    ISOLATION_FOREST_CONTAMINATION: float = float(
        os.environ.get("ISOLATION_FOREST_CONTAMINATION", 0.05)
    )
    ISOLATION_FOREST_N_ESTIMATORS: int = int(
        os.environ.get("ISOLATION_FOREST_N_ESTIMATORS", 100)
    )
    ZSCORE_STANDARD_THRESHOLD: float = float(
        os.environ.get("ZSCORE_STANDARD_THRESHOLD", 3.0)
    )
    ZSCORE_MARKET_OPEN_THRESHOLD: float = float(
        os.environ.get("ZSCORE_MARKET_OPEN_THRESHOLD", 4.5)
    )

    # Circuit breaker
    CIRCUIT_BREAKER_FAIL_MAX: int = int(
        os.environ.get("CIRCUIT_BREAKER_FAIL_MAX", 5)
    )
    CIRCUIT_BREAKER_RESET_TIMEOUT: int = int(
        os.environ.get("CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS", 300)
    )


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_ECHO = False  # Set True to log all SQL queries


class ProductionConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_ECHO = False


_CONFIG_MAP = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}


def get_config(name: str = "development"):
    return _CONFIG_MAP.get(name, DevelopmentConfig)
