from __future__ import annotations

import logging
import sqlite3

from flask import Flask
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS   # 🔥 ADDED

from .accounts import load_private_accounts
from .config import Config
from .routes import register_routes
from .runtime import get_async_mode
from .security import LoginRateLimiter
from .services import create_chat_services
from .sockets import register_socket_events


socketio: SocketIO | None = None
logger = logging.getLogger(__name__)


def create_app(config_object: type[Config] | None = None) -> Flask:
    global socketio

    app = Flask(__name__)
    app.config.from_object(config_object or Config)

    # 🔥 CORS FIX (CRITICAL)
    CORS(
        app,
        supports_credentials=True,
        origins=app.config["SOCKET_IO_CORS_ORIGINS"],
    )

    app.config["PRIVATE_ACCOUNTS"] = app.config.get("PRIVATE_ACCOUNTS") or load_private_accounts(app.config["APP_ENV"])

    if app.config["APP_ENV"] == "production":
        database_path = str(app.config.get("DATABASE_PATH", ""))
        if not database_path.startswith("/var/data/"):
            raise RuntimeError(
                "DATABASE_URL must resolve under /var/data in production for persistent sqlite storage. "
                f"Current resolved path: {database_path}"
            )

    if app.config["APP_ENV"] == "production" and app.config["SECRET_KEY"] == "change-me-in-production":
        raise RuntimeError("SECRET_KEY must be set when APP_ENV=production.")

    if app.config.get("TRUST_PROXY_HEADERS"):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

    socketio = SocketIO(
        app,
        async_mode=get_async_mode(),
        cors_allowed_origins=app.config["SOCKET_IO_CORS_ORIGINS"],
        cors_credentials=True,
        manage_session=False,
        logger=False,
        engineio_logger=False,
        ping_interval=app.config["SOCKET_IO_PING_INTERVAL"],
        ping_timeout=app.config["SOCKET_IO_PING_TIMEOUT"],
        max_http_buffer_size=app.config["SOCKET_IO_MAX_HTTP_BUFFER_SIZE"],
    )

    app.extensions["login_rate_limiter"] = LoginRateLimiter(
        max_attempts=app.config["LOGIN_RATE_LIMIT_MAX_ATTEMPTS"],
        window_seconds=app.config["LOGIN_RATE_LIMIT_WINDOW_SECONDS"],
    )

    register_routes(app)
    app.extensions["chat_services"] = create_chat_services(app.config, socketio)
    _validate_database_connection(str(app.config["DATABASE_PATH"]))
    register_socket_events(socketio)

    @app.after_request
    def apply_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

        if app.config["APP_ENV"] == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        if response.direct_passthrough:
            return response

        if response.content_type.startswith("application/json"):
            response.headers.setdefault("Cache-Control", "no-store")

        return response

    app.extensions["socketio"] = socketio
    return app


def _validate_database_connection(database_path: str) -> None:
    try:
        connection = sqlite3.connect(database_path, timeout=10)
        try:
            connection.execute("SELECT 1 FROM messages LIMIT 1").fetchone()
        finally:
            connection.close()
    except Exception as caught_error:
        logger.exception("Database startup check failed")
        raise RuntimeError("Database connection failed") from caught_error