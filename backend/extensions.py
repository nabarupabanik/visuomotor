"""
Singleton extension instances.

All extensions are created here at module level so they can be imported
anywhere without circular imports, then initialised with the app via
init_app() inside the app factory.
"""
import os
import redis as redis_lib
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from apscheduler.schedulers.background import BackgroundScheduler

# ── SQLAlchemy ────────────────────────────────────────────────────────────────
db = SQLAlchemy()

# ── JWT ───────────────────────────────────────────────────────────────────────
jwt = JWTManager()

# ── APScheduler ───────────────────────────────────────────────────────────────
scheduler = BackgroundScheduler(timezone="Asia/Kolkata")

# ── Redis ─────────────────────────────────────────────────────────────────────
# Initialised eagerly from environment so it can be imported directly
# into services without needing the Flask app context.
_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
redis_client: redis_lib.Redis = redis_lib.from_url(
    _redis_url,
    decode_responses=True,   # return str, not bytes
    socket_connect_timeout=0.1,
    socket_timeout=0.1,
)
