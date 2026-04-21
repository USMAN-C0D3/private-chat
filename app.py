from __future__ import annotations

import os

# 🔥 MUST BE FIRST (CRITICAL FIX)
import eventlet
eventlet.monkey_patch()

# ✅ THEN everything else
try:
    if os.environ.get("APP_ENV") != "production":
        from local_env import load_local_env
        load_local_env()
except Exception:
    pass

from server.runtime import get_async_mode
from server import create_app

ASYNC_MODE = get_async_mode()

app = create_app()
socketio = app.extensions["socketio"]

if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=app.config["DEBUG"],
        allow_unsafe_werkzeug=ASYNC_MODE == "threading",
    )