"""
Session API Blueprint.
Provides endpoints for cross-device checkpoint sync and optimistic hydration payloads.
"""
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.session_service import sync_checkpoint, get_checkpoint
from ..services.hydration_service import build_hydration_payload
from ..models.watchlist import Watchlist

session_bp = Blueprint("session", __name__)


@session_bp.route("/sync", methods=["POST"])
@jwt_required(optional=True)
def sync():
    """
    Persist session checkpoint (fired on disconnect / beforeunload via sendBeacon).
    Accepts both JSON body and text/plain (from sendBeacon).
    """
    user_id = get_jwt_identity()

    # Parse request payload
    data = None
    if request.is_json:
        data = request.get_json()
    else:
        raw_data = request.get_data(as_text=True)
        if raw_data:
            try:
                data = json.loads(raw_data)
            except Exception:
                pass

    if not data:
        return jsonify({"error": "Invalid checkpoint payload"}), 400

    # If unauthenticated, allow passing user_id in payload with validation
    payload_user_id = data.get("user_id") or user_id
    if not payload_user_id:
        return jsonify({"error": "User identity required"}), 401

    try:
        last_seen_ts = int(data.get("last_seen_ts") or 0)
    except (ValueError, TypeError):
        last_seen_ts = 0

    raw_prices = data.get("price_snapshot") or {}
    price_snapshot = {}
    if isinstance(raw_prices, dict):
        for sym, price in raw_prices.items():
            try:
                price_snapshot[str(sym).upper()] = int(round(float(price)))
            except (ValueError, TypeError):
                continue

    device_hint = str(data.get("device_hint") or "web")

    checkpoint = sync_checkpoint(
        user_id=payload_user_id,
        last_seen_ts=last_seen_ts,
        price_snapshot=price_snapshot,
        device_hint=device_hint,
    )

    return jsonify({
        "status": "synchronized",
        "checkpoint": checkpoint.to_dict(),
    }), 200


@session_bp.route("/checkpoint", methods=["GET"])
@jwt_required()
def checkpoint():
    """
    Retrieve current stored checkpoint for authenticated user.
    """
    user_id = get_jwt_identity()
    cp = get_checkpoint(user_id)
    if not cp:
        return jsonify({"checkpoint": None}), 200
    return jsonify({"checkpoint": cp.to_dict()}), 200


@session_bp.route("/hydrate", methods=["GET"])
@jwt_required()
def hydrate():
    """
    Retrieve optimistic hydration payload for session initialization.
    """
    user_id = get_jwt_identity()
    cp = get_checkpoint(user_id)
    last_seen_ts = cp.last_seen_ts if cp else 0
    last_seen_prices = cp.price_snapshot if cp else {}

    # Get user's active watchlist symbols
    user_watchlists = Watchlist.query.filter_by(user_id=user_id).all()
    symbols = []
    for wl in user_watchlists:
        for item in wl.items:
            if item.symbol not in symbols:
                symbols.append(item.symbol)

    payload = build_hydration_payload(
        user_id=user_id,
        last_seen_ts=last_seen_ts,
        last_seen_prices=last_seen_prices,
        symbols=symbols,
    )
    return jsonify(payload), 200
