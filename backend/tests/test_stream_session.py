"""
Tests for Session Sync, Hydration, and Streaming endpoints (Slice 2).
"""
import json
import pytest
from backend.app import create_app
from backend.extensions import db


@pytest.fixture
def client():
    app = create_app("development")
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.app_context():
        db.create_all()
        yield app.test_client()
        db.session.remove()
        db.drop_all()


def test_session_sync_and_hydrate(client):
    # 1. Register user
    reg = client.post("/api/auth/register", json={
        "email": "streamer@groww.in",
        "password": "password123",
    })
    token = reg.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Sync checkpoint
    sync_payload = {
        "last_seen_ts": 1725453000,
        "price_snapshot": {
            "RELIANCE": 240000,
            "TCS": 380000,
        },
        "device_hint": "mobile",
    }
    res_sync = client.post("/api/session/sync", headers=headers, json=sync_payload)
    assert res_sync.status_code == 200

    # 3. Retrieve checkpoint
    res_cp = client.get("/api/session/checkpoint", headers=headers)
    assert res_cp.status_code == 200
    cp_data = res_cp.get_json()["checkpoint"]
    assert cp_data["last_seen_ts"] == 1725453000
    assert cp_data["price_snapshot"]["RELIANCE"] == 240000

    # 4. Request optimistic hydration payload
    res_hyd = client.get("/api/session/hydrate", headers=headers)
    assert res_hyd.status_code == 200
    hyd_data = res_hyd.get_json()
    assert "ts" in hyd_data
    assert hyd_data["mode"] in ["live", "fallback"]
    assert isinstance(hyd_data["alerts"], list)


def test_tick_history_endpoint(client):
    res = client.get("/api/ticks/history?symbol=RELIANCE")
    assert res.status_code == 200
    data = res.get_json()
    assert data["symbol"] == "RELIANCE"
    assert len(data["history"]) > 0
