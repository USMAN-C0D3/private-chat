from __future__ import annotations

import logging
from datetime import datetime, timezone
from dataclasses import dataclass
from threading import Lock
import time
from typing import Any
from uuid import uuid4

from flask import current_app
from flask_socketio import SocketIO

from .store import BotWordlistStore, ChatStore, ReadReceiptStore, init_store_database


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ChatServices:
    store: Any
    read_receipts: Any
    bot_wordlists: Any


class InMemoryChatStore:
    def __init__(self, *, max_messages: int) -> None:
        self._max_messages = max_messages
        self._messages: list[dict[str, Any]] = []
        self._next_sequence = 1
        self._total_count = 0
        self._lock = Lock()

    @staticmethod
    def _timestamp_ms() -> int:
        return int(time.time() * 1000)

    def _trim(self) -> None:
        if len(self._messages) > self._max_messages:
            overflow = len(self._messages) - self._max_messages
            del self._messages[:overflow]

    def append(
        self,
        sender: str,
        text: str,
        reply_to: dict[str, Any] | None = None,
        *,
        client_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            message = {
                "id": str(uuid4()),
                "sequence": self._next_sequence,
                "sender": sender,
                "text": str(text),
                "timestamp": self._timestamp_ms(),
                "clientId": client_id,
                "replyTo": reply_to,
            }
            self._messages.append(message)
            self._next_sequence += 1
            self._total_count += 1
            self._trim()
            return dict(message)

    def append_many(self, sender: str, texts: list[str]) -> list[dict[str, Any]]:
        created: list[dict[str, Any]] = []
        for text in texts:
            if str(text):
                created.append(self.append(sender, str(text)))
        return created

    def latest(self) -> dict[str, Any] | None:
        with self._lock:
            if not self._messages:
                return None
            return dict(self._messages[-1])

    def latest_id(self) -> int | None:
        with self._lock:
            if not self._messages:
                return None
            return int(self._messages[-1]["sequence"])

    def recent_page(self, limit: int) -> tuple[list[dict[str, Any]], bool, int | None]:
        with self._lock:
            if not self._messages:
                return [], False, None
            page = self._messages[-limit:]
            has_more = len(self._messages) > len(page)
            next_cursor = int(page[0]["sequence"]) if has_more else None
            return [dict(row) for row in page], has_more, next_cursor

    def before_page(self, before_id: int, limit: int) -> tuple[list[dict[str, Any]], bool, int | None]:
        with self._lock:
            eligible = [row for row in self._messages if int(row["sequence"]) < before_id]
            if not eligible:
                return [], False, None
            page = eligible[-limit:]
            has_more = len(eligible) > len(page)
            next_cursor = int(page[0]["sequence"]) if has_more else None
            return [dict(row) for row in page], has_more, next_cursor

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "count": self._total_count,
                "stored": len(self._messages),
                "storeLimit": self._max_messages,
            }


class InMemoryReadReceiptStore:
    def __init__(self) -> None:
        self._receipts: dict[str, int] = {}
        self._lock = Lock()

    def last_read_for(self, username: str | None) -> int | None:
        if not username:
            return None
        with self._lock:
            value = self._receipts.get(username)
            return int(value) if value is not None else None

    def mark_read(self, username: str, message_id: int) -> int | None:
        if message_id <= 0:
            return None
        with self._lock:
            current = self._receipts.get(username, 0)
            if message_id <= current:
                return None
            self._receipts[username] = message_id
            return message_id


class InMemoryBotWordlistStore:
    def __init__(self) -> None:
        self._rows: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    def save(self, username: str, filename: str, words: list[str]) -> dict[str, Any]:
        updated_at = self._utc_now()
        row = {
            "filename": filename,
            "words": list(words),
            "lineCount": len(words),
            "updatedAt": updated_at,
        }
        with self._lock:
            self._rows[username] = row
        return {
            "hasWordlist": True,
            "filename": filename,
            "lineCount": len(words),
            "updatedAt": updated_at,
        }

    def metadata(self, username: str) -> dict[str, Any]:
        with self._lock:
            row = self._rows.get(username)
            if row is None:
                return {
                    "hasWordlist": False,
                    "filename": None,
                    "lineCount": 0,
                    "updatedAt": None,
                }
            return {
                "hasWordlist": True,
                "filename": row["filename"],
                "lineCount": row["lineCount"],
                "updatedAt": row["updatedAt"],
            }

    def get_words(self, username: str) -> list[str]:
        with self._lock:
            row = self._rows.get(username)
            if row is None:
                return []
            return list(row["words"])

    def clear(self, username: str) -> None:
        with self._lock:
            self._rows.pop(username, None)


def create_chat_services(config: dict[str, Any], socketio: SocketIO) -> ChatServices:
    del socketio

    database_url = config.get("DATABASE_URL")

    # 🔥 USE POSTGRES IF AVAILABLE
    if database_url and database_url.startswith("postgresql"):
        logger.info("Using PostgreSQL-backed chat storage")

        from .postgres_store import PostgresChatStore

        return ChatServices(
            store=PostgresChatStore(database_url),
            read_receipts=InMemoryReadReceiptStore(),  # can upgrade later
            bot_wordlists=InMemoryBotWordlistStore(),
        )

    # ✅ fallback (sqlite)
    database_path = config.get("DATABASE_PATH")

    if database_path:
        init_store_database(database_path)

        return ChatServices(
            store=ChatStore(
                database_path=database_path,
                max_messages=config["CHAT_STORE_LIMIT"],
            ),
            read_receipts=ReadReceiptStore(database_path=database_path),
            bot_wordlists=BotWordlistStore(database_path=database_path),
        )

    # ❌ fallback memory (only dev)
    logger.warning(
        "Falling back to in-memory store (NOT for production)"
    )

    return ChatServices(
        store=InMemoryChatStore(max_messages=config["CHAT_STORE_LIMIT"]),
        read_receipts=InMemoryReadReceiptStore(),
        bot_wordlists=InMemoryBotWordlistStore(),
    )


def get_chat_services() -> ChatServices:
    return current_app.extensions["chat_services"]
