from __future__ import annotations

from collections import deque
from secrets import compare_digest, token_urlsafe
from threading import Lock
from time import monotonic

from flask import current_app, request, session


CSRF_SESSION_KEY = "_csrf_token"


def ensure_csrf_token() -> str:
    token = session.get(CSRF_SESSION_KEY)
    if isinstance(token, str) and token:
        return token

    token = token_urlsafe(32)
    session[CSRF_SESSION_KEY] = token
    return token


def validate_csrf_token() -> bool:
    expected = ensure_csrf_token()
    provided = request.headers.get(current_app.config["CSRF_HEADER_NAME"], "").strip()
    return bool(provided) and compare_digest(provided, expected)


def request_origin_allowed() -> bool:
    origin = request.headers.get("Origin", "").strip()
    if not origin:
        return True

    host_url = request.host_url.rstrip("/")
    if origin == host_url:
        return True

    allowed_origins = current_app.config.get("SOCKET_IO_CORS_ORIGINS")
    if allowed_origins == "*" or allowed_origins == ["*"]:
        return True

    if not isinstance(allowed_origins, list):
        return False

    return origin in allowed_origins


def client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"

    return request.remote_addr or "unknown"


class LoginRateLimiter:
    def __init__(self, *, max_attempts: int, window_seconds: int) -> None:
        self._max_attempts = max(1, max_attempts)
        self._window_seconds = max(1, window_seconds)
        self._entries: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, key: str) -> tuple[bool, int | None]:
        now = monotonic()
        with self._lock:
            bucket = self._entries.get(key)
            if bucket is None:
                return True, None

            self._prune(bucket, now)
            if len(bucket) < self._max_attempts:
                if not bucket:
                    self._entries.pop(key, None)
                return True, None

            retry_after = max(1, int(self._window_seconds - (now - bucket[0])) + 1)
            return False, retry_after

    def record_failure(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            bucket = self._entries.setdefault(key, deque())
            self._prune(bucket, now)
            bucket.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._entries.pop(key, None)

    def _prune(self, bucket: deque[float], now: float) -> None:
        while bucket and now - bucket[0] >= self._window_seconds:
            bucket.popleft()
