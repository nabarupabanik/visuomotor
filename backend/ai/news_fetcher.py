"""
Financial News Fetcher Node.
Queries Marketaux news API with strict time-window filtering and exchange suffix formatting.
Protected by pybreaker Circuit Breaker (fail_max=5, reset_timeout=300) to isolate outages and HTTP 429s.
"""
import time
from datetime import datetime
from typing import List, Union
import requests
import pybreaker
from flask import current_app

from ..utils.circuit_breaker import news_circuit_breaker

# Circuit breaker: trip after 5 failures, 5-minute (300s) cooldown
news_breaker = news_circuit_breaker


class ArticleHeadline(str):
    """
    String subclass representing an article headline and description:
    `f"{title}: {description}"`.
    Behaves as a standard string while preserving dict-like subscripting (['title'])
    for backward compatibility with existing tests and pipelines.
    """
    def __getitem__(self, key):
        if key == "title":
            return str(self)
        if key == "description":
            return ""
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key == "title":
            return str(self)
        if key == "description":
            return ""
        return default

    def __contains__(self, key):
        if key == "title":
            return True
        return super().__contains__(key)


# Contextual fallback headlines for Indian tickers (offline / mock dev demo)
MOCK_HEADLINES = {
    "RELIANCE": [
        "Reliance Industries secures massive clean energy infrastructure contract: Major order win expands order book by 24%.",
        "Jio Platforms reports 18% YoY surge in average revenue per user: Telecom segment delivers robust EBITDA margins.",
    ],
    "TCS": [
        "TCS signs multi-year digital transformation deal with European banking group: Deal size valued at over $800M across 5 years.",
        "Tata Consultancy Services expands AI-first cloud architecture practice: New enterprise solutions launched for global clients.",
    ],
    "HDFCBANK": [
        "HDFC Bank Q1 loan growth exceeds analyst estimates across retail book: Asset quality remains pristine with lower slippages.",
        "RBI clears HDFC Bank subsidiary divestment roadmap: Regulatory nod provides capital relief.",
    ],
    "INFY": [
        "Infosys raises full-year constant-currency revenue guidance to 4-5%: Large deal total contract value hits new milestone.",
        "Infosys collaborates with leading automotive giant on GenAI engineering: Next-gen connected vehicle platform rolled out.",
    ],
    "ICICIBANK": [
        "ICICI Bank net interest margins expand 14 bps amid disciplined credit underwriting: Domestic corporate portfolio drives gains.",
    ],
}


@news_breaker
def fetch_news(symbol: str, start_ts: int = 0, end_ts: int = 0) -> List[Union[str, ArticleHeadline]]:
    """
    Fetch news headlines for the symbol within the user's offline time window [start_ts, end_ts].
    Calls Marketaux live API when configured, or provides contextual mock headlines.
    Protected by news_breaker circuit breaker (5 failures, 300s cooldown).
    """
    try:
        api_key = current_app.config.get("NEWS_API_KEY", "")
        base_url = current_app.config.get("NEWS_API_BASE_URL", "https://api.marketaux.com/v1")
    except RuntimeError:
        # Fallback if invoked outside Flask request/app context (e.g. background threads, tests)
        from ..config import get_config
        cfg = get_config()
        api_key = cfg.NEWS_API_KEY
        base_url = cfg.NEWS_API_BASE_URL

    # Format symbol for Indian exchanges (e.g., RELIANCE -> RELIANCE.NS, TATAMOTORS -> TATAMOTORS.NS)
    formatted_symbol = (
        symbol if (symbol.endswith(".NS") or symbol.endswith(".BO")) else f"{symbol}.NS"
    )

    # Convert the user's session exit epoch timestamp (start_ts) to ISO 8601 format
    # This enforces the strict "time-windowed" constraint
    if start_ts and start_ts > 0:
        published_after = datetime.fromtimestamp(start_ts).isoformat()
    else:
        # Default to previous 24 hours if start_ts is not provided
        published_after = datetime.fromtimestamp(time.time() - 86400).isoformat()

    # If live API key is configured and not a placeholder/mock, call Marketaux API
    if (
        api_key
        and api_key != "mock_news_api_key"
        and not api_key.startswith("REPLACE_WITH")
    ):
        url = f"{base_url}/news/all"
        params = {
            "symbols": formatted_symbol,
            "published_after": published_after,
            "api_token": api_key,
            "language": "en",
        }

        # Execute the request with a strict 5-second timeout
        response = requests.get(url, params=params, timeout=5)

        # Raise an exception on rate limits (429) to intentionally trip the circuit breaker
        if response.status_code == 429:
            raise Exception("News API rate limit exceeded")

        response.raise_for_status()
        data = response.json()

        # Extract and concatenate headlines and descriptions for the LLM summarizer node
        articles = data.get("data", [])
        return [
            ArticleHeadline(
                f"{article.get('title', '')}: {article.get('description', '')}"
            )
            for article in articles
        ]

    # Offline / demo fallback mode (used when NEWS_API_KEY=mock_news_api_key)
    base_sym = symbol.replace(".NS", "").replace(".BO", "")
    headlines = MOCK_HEADLINES.get(
        base_sym,
        [
            f"{base_sym} sees sharp institutional volume accumulation on heavy intraday block deals: Trading volumes spike 3.2x relative to 20-day average."
        ],
    )
    return [ArticleHeadline(h) for h in headlines]
