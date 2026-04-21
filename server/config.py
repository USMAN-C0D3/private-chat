from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def _sqlite_path_from_database_url(database_url: str) -> Path | None:
    value = database_url.strip()

    # Only handle sqlite URLs
    if value.startswith("sqlite:///"):
        return Path(value.removeprefix("sqlite:///"))

    if value.startswith("sqlite://"):
        return Path(value.removeprefix("sqlite://"))

    # For postgres or anything else → DO NOT treat as file path
    return None


def default_database_url(app_env: str) -> str:
    env_url = os.getenv("DATABASE_URL", "").strip()
    if env_url:
        return env_url

    # Backward compatibility
    legacy_path = os.getenv("DATABASE_PATH", "").strip()
    if legacy_path:
        return legacy_path

    # Default fallback
    if app_env == "production":
        return "sqlite:////var/data/private_chat.sqlite3"

    return f"sqlite:///{BASE_DIR / 'instance' / 'private_chat.sqlite3'}"


def getenv_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def getenv_str(name: str, default: str) -> str:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    value = raw_value.strip()
    return value or default


def getenv_csv(name: str, default: list[str]) -> list[str]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    values = [item.strip() for item in raw_value.split(",") if item.strip()]
    return values or default


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


class Config:
    APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
    TESTING = getenv_bool("TESTING", False)
    DEBUG = getenv_bool("FLASK_DEBUG", False)
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    TRUST_PROXY_HEADERS = getenv_bool("TRUST_PROXY_HEADERS", APP_ENV == "production")

    # ✅ FIXED: supports postgres safely
    DATABASE_URL = default_database_url(APP_ENV)
    DATABASE_PATH = _sqlite_path_from_database_url(DATABASE_URL)

    # Optional debug (remove later if you want)
    print("DATABASE_URL:", DATABASE_URL)

    SESSION_COOKIE_NAME = "private_chat_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = getenv_str(
        "SESSION_COOKIE_SAMESITE",
        "None" if APP_ENV == "production" else "Lax",
    )
    SESSION_COOKIE_SECURE = getenv_bool(
        "SESSION_COOKIE_SECURE",
        APP_ENV == "production",
    )
    PERMANENT_SESSION_LIFETIME = timedelta(
        days=max(1, min(int(os.getenv("PERMANENT_SESSION_LIFETIME_DAYS", "30")), 365))
    )
    SESSION_REFRESH_EACH_REQUEST = getenv_bool(
        "SESSION_REFRESH_EACH_REQUEST",
        APP_ENV == "production",
    )
    PREFERRED_URL_SCHEME = "https" if APP_ENV == "production" else "http"

    FRONTEND_DIST_DIR = BASE_DIR / "dist"
    FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"

    CHAT_STORE_LIMIT = 100_000
    CHAT_HISTORY_PAGE_SIZE = 80
    CHAT_HISTORY_MAX_PAGE_SIZE = 200
    MAX_MESSAGE_LENGTH = 2_000

    PRIVATE_CHAT_ROOM = "private-two-user-thread"
    CSRF_HEADER_NAME = "X-CSRF-Token"

    LOGIN_RATE_LIMIT_WINDOW_SECONDS = clamp(
        int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "600")),
        60,
        86_400,
    )
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS = clamp(
        int(os.getenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "6")),
        2,
        100,
    )

    SOCKET_IO_CORS_ORIGINS: list[str] | str = (
        getenv_csv(
            "SOCKET_IO_CORS_ORIGINS",
            [
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                "http://127.0.0.1:5000",
                "http://localhost:5000",
            ],
        )
        if APP_ENV == "development"
        else getenv_csv(
            "SOCKET_IO_CORS_ORIGINS",
            ["https://private-chat-wine-nine.vercel.app"],
        )
    )

    SOCKET_IO_PING_INTERVAL = 25
    SOCKET_IO_PING_TIMEOUT = 20
    SOCKET_IO_MAX_HTTP_BUFFER_SIZE = clamp(
        int(os.getenv("SOCKET_IO_MAX_HTTP_BUFFER_SIZE", "2000000")),
        500_000,
        10_000_000,
    )

    BOT_EMIT_BATCH_SIZE = clamp(
        int(os.getenv("BOT_EMIT_BATCH_SIZE", "120")),
        20,
        2_000,
    )
    BOT_PROGRESS_INTERVAL = clamp(
        int(os.getenv("BOT_PROGRESS_INTERVAL", "250")),
        25,
        5_000,
    )
    BOT_WORDLIST_MAX_UPLOAD_BYTES = clamp(
        int(os.getenv("BOT_WORDLIST_MAX_UPLOAD_BYTES", "5000000")),
        100_000,
        25_000_000,
    )
    BOT_WORDLIST_MAX_LINES = clamp(
        int(os.getenv("BOT_WORDLIST_MAX_LINES", "100000")),
        1_000,
        1_000_000,
    )