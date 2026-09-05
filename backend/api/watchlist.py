"""
Watchlist Management Blueprint.
Provides CRUD operations for user watchlists and items with strict user isolation.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.watchlist import Watchlist, WatchlistItem
from ..models.stock_symbols import StockSymbol

watchlist_bp = Blueprint("watchlist", __name__)


def _get_user_watchlist(watchlist_id: str, user_id: str):
    """
    Retrieve watchlist assert user ownership.
    Returns None if not found or unauthorized (security: returns 404 in caller).
    """
    wl = db.session.get(Watchlist, watchlist_id)
    if not wl or wl.user_id != user_id:
        return None
    return wl


@watchlist_bp.route("/catalog", methods=["GET"])
@jwt_required()
def get_catalog():
    """
    Search or list available stock symbols from the reference catalog.
    Uses PostgreSQL pg_trgm GIN indexes for fast, typo-tolerant trigram search.
    Query param: ?q=asian
    """
    query = request.args.get("q", "").strip()
    if query:
        dialect_name = db.engine.dialect.name
        if dialect_name == "postgresql":
            from sqlalchemy import text
            raw_sql = text("""
                SELECT symbol, company_name, exchange, asset_class, week_52_high, week_52_low,
                       GREATEST(similarity(symbol, :q), similarity(company_name, :q)) as rank_score
                FROM stock_symbols
                WHERE symbol ILIKE :prefix 
                   OR company_name ILIKE :contains
                   OR symbol % :q
                   OR company_name % :q
                ORDER BY 
                   CASE WHEN company_name ILIKE :exact THEN 1
                        WHEN symbol ILIKE :exact THEN 2
                        WHEN symbol ILIKE :prefix THEN 3
                        WHEN company_name ILIKE :prefix THEN 4
                        ELSE 5 END,
                   rank_score DESC
                LIMIT 20;
            """)
            rows = db.session.execute(raw_sql, {
                "q": query,
                "prefix": f"{query}%",
                "contains": f"%{query}%",
                "exact": query,
            }).fetchall()

            catalog = [
                {
                    "symbol": r.symbol,
                    "company_name": r.company_name,
                    "exchange": r.exchange,
                    "asset_class": r.asset_class,
                    "week_52_high": r.week_52_high,
                    "week_52_low": r.week_52_low,
                }
                for r in rows
            ]
            return jsonify({"catalog": catalog}), 200

        symbols = StockSymbol.query.filter(
            (StockSymbol.symbol.ilike(f"%{query}%")) |
            (StockSymbol.company_name.ilike(f"%{query}%"))
        ).limit(20).all()
    else:
        symbols = StockSymbol.query.limit(50).all()

    return jsonify({
        "catalog": [s.to_dict() for s in symbols],
    }), 200


@watchlist_bp.route("", methods=["GET"])
@jwt_required()
def list_watchlists():
    """
    List all watchlists belonging to the authenticated user.
    """
    user_id = get_jwt_identity()
    watchlists = Watchlist.query.filter_by(user_id=user_id).order_by(Watchlist.created_at.asc()).all()
    return jsonify({
        "watchlists": [wl.to_dict(include_items=True) for wl in watchlists],
    }), 200


@watchlist_bp.route("", methods=["POST"])
@jwt_required()
def create_watchlist():
    """
    Create a new empty or seeded watchlist.
    """
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"error": "Watchlist name is required"}), 400

    new_wl = Watchlist(user_id=user_id, name=name)
    db.session.add(new_wl)
    db.session.commit()

    return jsonify({
        "message": "Watchlist created",
        "watchlist": new_wl.to_dict(include_items=True),
    }), 201


@watchlist_bp.route("/<watchlist_id>", methods=["GET"])
@jwt_required()
def get_watchlist(watchlist_id):
    """
    Get detailed watchlist with all items and reference symbol metadata.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    return jsonify({
        "watchlist": wl.to_dict(include_items=True),
    }), 200


@watchlist_bp.route("/<watchlist_id>", methods=["PUT"])
@jwt_required()
def rename_watchlist(watchlist_id):
    """
    Rename an existing watchlist.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Watchlist name cannot be empty"}), 400

    wl.name = name
    db.session.commit()

    return jsonify({
        "message": "Watchlist renamed",
        "watchlist": wl.to_dict(),
    }), 200


@watchlist_bp.route("/<watchlist_id>", methods=["DELETE"])
@jwt_required()
def delete_watchlist(watchlist_id):
    """
    Delete a watchlist and cascade-delete all its items.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    # Keep at least one watchlist per user
    count = Watchlist.query.filter_by(user_id=user_id).count()
    if count <= 1:
        return jsonify({"error": "Cannot delete your only watchlist"}), 400

    db.session.delete(wl)
    db.session.commit()

    return jsonify({
        "message": "Watchlist deleted successfully",
    }), 200


@watchlist_bp.route("/<watchlist_id>/items", methods=["GET"])
@jwt_required()
def list_watchlist_items(watchlist_id):
    """
    List all items in a watchlist.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    items = WatchlistItem.query.filter_by(watchlist_id=watchlist_id).order_by(WatchlistItem.display_order.asc()).all()
    return jsonify({
        "items": [item.to_dict() for item in items],
    }), 200


@watchlist_bp.route("/<watchlist_id>/items", methods=["POST"])
@jwt_required()
def add_watchlist_item(watchlist_id):
    """
    Add a stock symbol to the watchlist.
    Enforces UNIQUE(watchlist_id, symbol) constraint.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    data = request.get_json() or {}
    symbol = (data.get("symbol") or "").strip().upper()
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400

    # Check if duplicate in this watchlist
    existing = WatchlistItem.query.filter_by(watchlist_id=watchlist_id, symbol=symbol).first()
    if existing:
        return jsonify({"error": f"{symbol} is already in this watchlist"}), 409

    # Determine highest display_order
    max_order_item = WatchlistItem.query.filter_by(watchlist_id=watchlist_id).order_by(WatchlistItem.display_order.desc()).first()
    next_order = (max_order_item.display_order + 1) if max_order_item else 0

    item = WatchlistItem(
        watchlist_id=watchlist_id,
        symbol=symbol,
        display_order=next_order,
    )
    db.session.add(item)
    db.session.commit()

    return jsonify({
        "message": f"Added {symbol} to watchlist",
        "item": item.to_dict(),
    }), 201


@watchlist_bp.route("/<watchlist_id>/items/<symbol>", methods=["DELETE"])
@jwt_required()
def remove_watchlist_item(watchlist_id, symbol):
    """
    Remove a symbol from the watchlist.
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    symbol = symbol.strip().upper()
    item = WatchlistItem.query.filter_by(watchlist_id=watchlist_id, symbol=symbol).first()
    if not item:
        return jsonify({"error": f"Symbol {symbol} not found in watchlist"}), 404

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        "message": f"Removed {symbol} from watchlist",
    }), 200


@watchlist_bp.route("/<watchlist_id>/items/reorder", methods=["PUT"])
@jwt_required()
def reorder_watchlist_items(watchlist_id):
    """
    Update display order for an array of symbols.
    Body: {"symbols": ["RELIANCE", "TCS", "HDFCBANK"]}
    """
    user_id = get_jwt_identity()
    wl = _get_user_watchlist(watchlist_id, user_id)
    if not wl:
        return jsonify({"error": "Watchlist not found"}), 404

    data = request.get_json() or {}
    symbols_order = data.get("symbols", [])
    if not isinstance(symbols_order, list):
        return jsonify({"error": "symbols must be a list"}), 400

    items_map = {item.symbol: item for item in wl.items}
    for order_idx, sym in enumerate(symbols_order):
        sym_clean = sym.strip().upper()
        if sym_clean in items_map:
            items_map[sym_clean].display_order = order_idx

    db.session.commit()

    updated_items = WatchlistItem.query.filter_by(watchlist_id=watchlist_id).order_by(WatchlistItem.display_order.asc()).all()
    return jsonify({
        "message": "Watchlist reordered",
        "items": [i.to_dict() for i in updated_items],
    }), 200
