"""
SSE Stream API Blueprint.
Provides the real-time Server-Sent Events stream for market ticks and AI summaries.
"""
import json
import queue
from flask import Blueprint, Response, request
from ..services.tick_broadcaster import broadcaster

stream_bp = Blueprint("stream", __name__)


@stream_bp.route("/stream", methods=["GET"])
def stream():
    """
    Real-time Server-Sent Events (SSE) feed.
    Streams live tick events to connected client applications.
    """
    # Ensure broadcaster background loop is active
    broadcaster.start()

    # Optional filter for symbols (e.g. ?symbols=RELIANCE,TCS)
    symbols_param = request.args.get("symbols", "")
    filter_symbols = set(s.strip().upper() for s in symbols_param.split(",")) if symbols_param else None

    # Thread-safe client message queue
    client_queue = queue.Queue(maxsize=50)

    def on_tick(tick):
        if filter_symbols is None or tick["s"] in filter_symbols:
            try:
                client_queue.put_nowait(tick)
            except queue.Full:
                pass  # drop tick if client is slow to consume

    broadcaster.subscribe(on_tick)

    def event_generator():
        # 1. Immediate retry recommendation for client reconnection
        yield "retry: 3000\n\n"

        # 2. Emit initial heartbeat
        yield "event: ping\ndata: {\"status\":\"connected\"}\n\n"

        try:
            while True:
                try:
                    # Wait up to 15s for tick; emit heartbeat comment on timeout
                    tick = client_queue.get(timeout=15.0)
                    data_str = json.dumps(tick)
                    yield f"event: tick\ndata: {data_str}\n\n"
                except queue.Empty:
                    # SSE keep-alive comment
                    yield ": keepalive\n\n"
        finally:
            broadcaster.unsubscribe(on_tick)

    response = Response(
        event_generator(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )
    return response


@stream_bp.route("/ticks/history", methods=["GET"])
def tick_history():
    """
    Returns historical tick snapshot for micro-sparklines (Slice 5).
    """
    symbol = request.args.get("symbol", "RELIANCE").upper()
    current_p = broadcaster.get_latest_price(symbol)
    
    # Return 20 mock recent points showing natural micro-fluctuations
    import time
    now = int(time.time())
    history = []
    price = current_p
    for i in range(20, 0, -1):
        delta = (i % 3 - 1) * int(current_p * 0.001)
        history.append([now - (i * 3), price + delta])
    history.append([now, current_p])

    return {"symbol": symbol, "history": history}, 200
