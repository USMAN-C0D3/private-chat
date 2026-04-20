from __future__ import annotations

import os


print("APP_ENV =", os.environ.get("APP_ENV"))
print("USER1 =", os.environ.get("PRIVATE_ACCOUNT_1_USERNAME"))
print("PASS1 =", os.environ.get("PRIVATE_ACCOUNT_1_PASSWORD"))
print("PASS2 =", os.environ.get("PRIVATE_ACCOUNT_2_PASSWORD"))

# ✅ ONLY load local env in development
try:
    if os.environ.get("APP_ENV") != "production":
        from local_env import load_local_env
        load_local_env()
except Exception:
    pass

from server.runtime import get_async_mode

ASYNC_MODE = get_async_mode()

if ASYNC_MODE == "eventlet":
    import eventlet
    eventlet.monkey_patch()

from server import create_app

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