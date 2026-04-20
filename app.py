from __future__ import annotations

import os

from local_env import load_local_env

load_local_env()

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
