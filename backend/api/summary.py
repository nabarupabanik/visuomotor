"""
Summary API Blueprint.
Triggers on-demand AI pipeline for flagged symbols and returns catalyst context.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from ..ai.catalyst_graph import catalyst_pipeline

summary_bp = Blueprint("summary", __name__)


@summary_bp.route("/generate", methods=["POST"])
@jwt_required(optional=True)
def generate_summary():
    """
    Triggers the LangGraph AI pipeline for an alert symbol.
    Body: {"symbol": "RELIANCE", "start_ts": 1725450000, "end_ts": 1725453000, "delta_bps": 420}
    """
    data = request.get_json() or {}
    symbol = (data.get("symbol") or "").strip().upper()
    start_ts = data.get("start_ts", 0)
    end_ts = data.get("end_ts", 0)
    delta_bps = data.get("delta_bps", 0)

    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400

    initial_state = {
        "symbol": symbol,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "delta_bps": delta_bps,
        "cache_hit": False,
        "headlines": [],
        "summary": None,
        "error": None,
    }

    try:
        final_state = catalyst_pipeline.invoke(initial_state)
        if final_state.get("error"):
            return jsonify({
                "symbol": symbol,
                "error": final_state["error"],
            }), 502

        return jsonify({
            "symbol": symbol,
            "summary": final_state.get("summary"),
            "cache_hit": final_state.get("cache_hit", False),
        }), 200

    except Exception as exc:
        return jsonify({
            "symbol": symbol,
            "error": str(exc),
        }), 500
