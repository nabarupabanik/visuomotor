"""
Unit and integration tests for Slice 1: Authentication and Watchlist CRUD.
"""
import pytest
from backend.app import create_app
from backend.extensions import db
from backend.models.user import User
from backend.models.watchlist import Watchlist, WatchlistItem


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


def test_register_and_login(client):
    # 1. Register new user
    res = client.post("/api/auth/register", json={
        "email": "trader@groww.in",
        "password": "securepassword123",
    })
    assert res.status_code == 201
    data = res.get_json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "trader@groww.in"

    # 2. Duplicate registration fails with 409
    res_dup = client.post("/api/auth/register", json={
        "email": "trader@groww.in",
        "password": "anotherpassword",
    })
    assert res_dup.status_code == 409

    # 3. Login with correct credentials
    res_login = client.post("/api/auth/login", json={
        "email": "trader@groww.in",
        "password": "securepassword123",
    })
    assert res_login.status_code == 200
    login_data = res_login.get_json()
    token = login_data["access_token"]
    assert token is not None

    # 4. Login with invalid password fails with 401
    res_bad = client.post("/api/auth/login", json={
        "email": "trader@groww.in",
        "password": "wrongpassword",
    })
    assert res_bad.status_code == 401

    # 5. Access /api/auth/me with Bearer token
    headers = {"Authorization": f"Bearer {token}"}
    res_me = client.get("/api/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.get_json()["user"]["email"] == "trader@groww.in"


def test_watchlist_crud_flow(client):
    # Register & get token
    reg = client.post("/api/auth/register", json={
        "email": "alpha@groww.in",
        "password": "password123",
    })
    token = reg.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. User should have an auto-seeded default watchlist
    res_wl = client.get("/api/watchlists", headers=headers)
    assert res_wl.status_code == 200
    watchlists = res_wl.get_json()["watchlists"]
    assert len(watchlists) == 1
    default_wl_id = watchlists[0]["id"]
    assert watchlists[0]["name"] == "My Watchlist"
    assert len(watchlists[0]["items"]) == 5

    # 2. Create a new custom watchlist
    res_create = client.post("/api/watchlists", headers=headers, json={
        "name": "Tech Titans",
    })
    assert res_create.status_code == 201
    new_wl_id = res_create.get_json()["watchlist"]["id"]

    # 3. Add symbols to Tech Titans
    res_add1 = client.post(f"/api/watchlists/{new_wl_id}/items", headers=headers, json={"symbol": "INFY"})
    assert res_add1.status_code == 201

    res_add2 = client.post(f"/api/watchlists/{new_wl_id}/items", headers=headers, json={"symbol": "TCS"})
    assert res_add2.status_code == 201

    # 4. Add duplicate symbol -> should return 409
    res_add_dup = client.post(f"/api/watchlists/{new_wl_id}/items", headers=headers, json={"symbol": "INFY"})
    assert res_add_dup.status_code == 409

    # 5. Reorder items
    res_reorder = client.put(f"/api/watchlists/{new_wl_id}/items/reorder", headers=headers, json={
        "symbols": ["TCS", "INFY"],
    })
    assert res_reorder.status_code == 200
    reordered_items = res_reorder.get_json()["items"]
    assert reordered_items[0]["symbol"] == "TCS"
    assert reordered_items[1]["symbol"] == "INFY"

    # 6. Delete an item
    res_del_item = client.delete(f"/api/watchlists/{new_wl_id}/items/INFY", headers=headers)
    assert res_del_item.status_code == 200

    # 7. Check items list
    res_items = client.get(f"/api/watchlists/{new_wl_id}/items", headers=headers)
    items_after = res_items.get_json()["items"]
    assert len(items_after) == 1
    assert items_after[0]["symbol"] == "TCS"

    # 8. Rename watchlist
    res_rename = client.put(f"/api/watchlists/{new_wl_id}", headers=headers, json={"name": "IT Bluechips"})
    assert res_rename.status_code == 200
    assert res_rename.get_json()["watchlist"]["name"] == "IT Bluechips"

    # 9. Delete watchlist
    res_del = client.delete(f"/api/watchlists/{new_wl_id}", headers=headers)
    assert res_del.status_code == 200

    # 10. Verify remaining watchlist count is 1
    res_wl_final = client.get("/api/watchlists", headers=headers)
    assert len(res_wl_final.get_json()["watchlists"]) == 1
