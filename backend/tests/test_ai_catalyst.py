"""
Unit and integration tests for Slice 4: Contextual AI Catalyst and Circuit Breakers.
"""
import pytest
from backend.app import create_app
from backend.ai.news_fetcher import fetch_news
from backend.ai.summarizer import generate_streaming_summary
from backend.ai.catalyst_graph import catalyst_pipeline
from backend.utils.circuit_breaker import news_circuit_breaker


@pytest.fixture
def client():
    app = create_app("development")
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.app_context():
        yield app.test_client()


def test_news_fetcher_with_circuit_breaker():
    headlines = fetch_news("RELIANCE", 1725450000, 1725453000)
    assert isinstance(headlines, list)
    assert len(headlines) > 0
    assert "title" in headlines[0]
    assert news_circuit_breaker.current_state == "closed"


def test_streaming_summarizer():
    headlines = [{"title": "Reliance bags major renewable energy contract."}]
    token_gen = generate_streaming_summary("RELIANCE", headlines, delta_bps=340)
    tokens = list(token_gen)
    full_summary = "".join(tokens)
    assert len(tokens) > 0
    assert "Reliance" in full_summary
    assert len(full_summary) > 10


def test_catalyst_state_graph():
    initial_state = {
        "symbol": "TCS",
        "start_ts": 1725450000,
        "end_ts": 1725453000,
        "delta_bps": 210,
        "cache_hit": False,
        "headlines": [],
        "summary": None,
        "error": None,
    }
    result = catalyst_pipeline.invoke(initial_state)
    assert result["summary"] is not None
    assert len(result["summary"]) > 0


def test_generate_summary_endpoint(client):
    res = client.post("/api/summary/generate", json={
        "symbol": "HDFCBANK",
        "start_ts": 1725450000,
        "end_ts": 1725453000,
        "delta_bps": -180,
    })
    assert res.status_code == 200
    data = res.get_json()
    assert data["symbol"] == "HDFCBANK"
    assert "summary" in data
    assert data["summary"] is not None
