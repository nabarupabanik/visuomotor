"""
Authentication Blueprint.
Handles registration, login, and token refresh using Flask-JWT-Extended.
"""
import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from ..extensions import db
from ..models.user import User
from ..models.watchlist import Watchlist, WatchlistItem

auth_bp = Blueprint("auth", __name__)

EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user account and auto-seed a default watchlist.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"error": "A valid email address is required"}), 400

    if not password or len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long"}), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"error": "Email is already registered"}), 409

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # populate user.id

    # Create default watchlist for convenient onboarding
    default_wl = Watchlist(user_id=user.id, name="My Watchlist")
    db.session.add(default_wl)
    db.session.flush()

    # Seed with top liquid stocks
    default_symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
    for idx, sym in enumerate(default_symbols):
        item = WatchlistItem(
            watchlist_id=default_wl.id,
            symbol=sym,
            display_order=idx,
        )
        db.session.add(item)

    db.session.commit()

    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "message": "User registered successfully",
        "user": user.to_dict(),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate user credentials and issue JWT tokens.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "message": "Login successful",
        "user": user.to_dict(),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """
    Generate a new access token using a valid refresh token.
    """
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    return jsonify({
        "access_token": new_access_token,
    }), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """
    Return currently authenticated user profile.
    """
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "user": user.to_dict(),
    }), 200
