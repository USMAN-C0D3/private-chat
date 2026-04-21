from __future__ import annotations

import logging
import sqlite3

from flask import Flask
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_cors import CORS

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

    # ✅ CORS
    CORS(
        app,
        supports_credentials=True,
        origins=app.config["SOCKET_IO_CORS_ORIGINS"],
    )

    app.config["PRIVATE_ACCOUNTS"] = app.config.get("PRIVATE_ACCOUNTS") or load_private_accounts(app.config["APP_ENV"])

    db_url = str(app.config.get("DATABASE_URL", "")).strip()
    if not db_url:
        database_path_fallback = app.config.get("DATABASE_PATH")
        if database_path_fallback:
            db_url = f"sqlite:///{database_path_fallback}"

    # ✅ FIX: Only enforce /var/data for SQLite
    if db_url.startswith("sqlite"):
        database_path = str(app.config.get("DATABASE_PATH", ""))

        if app.config["APP_ENV"] == "production":
            if not database_path.startswith("/var/data/"):
                raise RuntimeError(
                    "SQLite must be under /var/data in production."
                )

    # ✅ SECRET KEY CHECK
    if app.config["APP_ENV"] == "production" and app.config["SECRET_KEY"] == "change-me-in-production":
        raise RuntimeError("SECRET_KEY must be set when APP_ENV=production.")

    # ✅ Proxy
    if app.config.get("TRUST_PROXY_HEADERS"):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

    # ✅ SocketIO configuration
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

    # ✅ FIX: Validate DB correctly based on type
    _validate_database_connection(db_url, app.config.get("DATABASE_PATH"))

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


def _validate_database_connection(database_url: str, database_path: str | None) -> None:
    try:
        # ✅ Handle SQLite
        if database_url.startswith("sqlite") and database_path:
            connection = sqlite3.connect(database_path, timeout=10)
            try:
                connection.execute("SELECT 1 FROM messages LIMIT 1").fetchone()
            finally:
                connection.close()

        # ✅ Handle Postgres (Supabase)
        elif database_url.startswith("postgresql"):
            try:
                import psycopg2  # type: ignore[import-not-found]
            except ImportError as import_error:
                raise RuntimeError(
                    "PostgreSQL URL detected but psycopg2 is not installed. "
                    "Run 'pip install -r requirements.txt'."
                ) from import_error

            conn = psycopg2.connect(database_url)
            try:
                cur = conn.cursor()
                cur.execute("SELECT 1 FROM messages LIMIT 1")
                cur.fetchone()
                cur.close()
            finally:
                conn.close()

    except Exception as caught_error:
        logger.exception("Database startup check failed")
        raise RuntimeError("Database connection failed") from caught_error