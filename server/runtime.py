from __future__ import annotations

import os


SUPPORTED_ASYNC_MODES = {"eventlet", "threading"}


def get_async_mode() -> str:
    configured_mode = os.getenv("CHAT_ASYNC_MODE", "").strip().lower()
    if configured_mode in SUPPORTED_ASYNC_MODES:
        return configured_mode

    return "threading"
