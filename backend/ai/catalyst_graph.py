"""
LangGraph AI Catalyst Pipeline.
State machine executing:
  START -> check_cache_node -> (hit -> END)
                            -> (miss -> fetch_news_node -> generate_summary_node -> write_cache_node -> END)
"""
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from ..extensions import redis_client
from ..utils.redis_keys import summary_cache
from .news_fetcher import fetch_news
from .summarizer import generate_streaming_summary


class CatalystState(TypedDict):
    symbol: str
    start_ts: int
    end_ts: int
    delta_bps: int
    cache_hit: bool
    headlines: List[Dict[str, Any]]
    summary: Optional[str]
    error: Optional[str]


def check_cache_node(state: CatalystState) -> Dict[str, Any]:
    """Check Redis for pre-existing summary in this 4h window."""
    symbol = state["symbol"]
    start_ts = state.get("start_ts", 0)
    end_ts = state.get("end_ts", 0)

    # Round to 4-hour window
    window_start = (start_ts // 14400) * 14400 if start_ts else 0
    window_end = window_start + 14400
    cache_key = summary_cache(symbol, window_start, window_end)

    try:
        cached = redis_client.get(cache_key)
        if cached:
            # Decode bytes → str (redis-py returns bytes by default)
            summary_text = cached.decode("utf-8") if isinstance(cached, bytes) else cached
            return {"cache_hit": True, "summary": summary_text}
    except Exception:
        pass

    return {"cache_hit": False}


def fetch_news_node(state: CatalystState) -> Dict[str, Any]:
    """Fetch time-windowed news headlines for symbol."""
    if state.get("cache_hit"):
        return {}

    try:
        headlines = fetch_news(
            symbol=state["symbol"],
            start_ts=state.get("start_ts", 0),
            end_ts=state.get("end_ts", 0),
        )
        return {"headlines": headlines}
    except Exception as exc:
        return {"error": str(exc), "headlines": []}


def generate_summary_node(state: CatalystState) -> Dict[str, Any]:
    """Run LLM summarizer on headlines."""
    if state.get("cache_hit") or state.get("error"):
        return {}

    headlines = state.get("headlines", [])
    symbol = state["symbol"]
    delta_bps = state.get("delta_bps", 0)

    try:
        token_gen = generate_streaming_summary(symbol, headlines, delta_bps)
        # Consume tokens to build full summary for graph state
        tokens = list(token_gen)
        full_summary = "".join(tokens)
        return {"summary": full_summary}
    except Exception as exc:
        return {"error": str(exc)}


def write_cache_node(state: CatalystState) -> Dict[str, Any]:
    """Persist generated summary to Redis with 4h TTL."""
    if state.get("cache_hit") or not state.get("summary"):
        return {}

    symbol = state["symbol"]
    start_ts = state.get("start_ts", 0)
    window_start = (start_ts // 14400) * 14400 if start_ts else 0
    window_end = window_start + 14400
    cache_key = summary_cache(symbol, window_start, window_end)

    try:
        redis_client.set(cache_key, state["summary"], ex=14400)
    except Exception:
        pass

    return {}


def should_continue_after_cache(state: CatalystState) -> str:
    if state.get("cache_hit"):
        return "end"
    return "fetch_news"


def should_continue_after_news(state: CatalystState) -> str:
    if state.get("error"):
        return "end"
    return "generate_summary"


# Build LangGraph StateGraph
builder = StateGraph(CatalystState)
builder.add_node("check_cache", check_cache_node)
builder.add_node("fetch_news", fetch_news_node)
builder.add_node("generate_summary", generate_summary_node)
builder.add_node("write_cache", write_cache_node)

builder.set_entry_point("check_cache")

builder.add_conditional_edges(
    "check_cache",
    should_continue_after_cache,
    {"end": END, "fetch_news": "fetch_news"}
)

builder.add_conditional_edges(
    "fetch_news",
    should_continue_after_news,
    {"end": END, "generate_summary": "generate_summary"}
)

builder.add_edge("generate_summary", "write_cache")
builder.add_edge("write_cache", END)

catalyst_pipeline = builder.compile()
