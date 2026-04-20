from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Iterable


def init_store_database(database_path: str | Path) -> None:
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(path, timeout=30)
    try:
        _configure_connection(connection)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS read_receipts (
                username TEXT PRIMARY KEY,
                last_read_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bot_wordlists (
                username TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                content TEXT NOT NULL,
                line_count INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        connection.commit()
    finally:
        connection.close()


def _configure_connection(connection: sqlite3.Connection) -> None:
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=30000")


@dataclass(slots=True, frozen=True)
class ChatMessage:
    id: int
    sender: str
    text: str
    timestamp: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sender": self.sender,
            "text": self.text,
            "timestamp": self.timestamp,
        }


class ChatStore:
    def __init__(self, *, database_path: str | Path, max_messages: int) -> None:
        self._database_path = Path(database_path)
        self._max_messages = max_messages
        self._write_lock = Lock()

    def append(self, sender: str, text: str) -> dict[str, Any]:
        return self.append_many(sender, [text])[0]

    def append_many(self, sender: str, texts: Iterable[str]) -> list[dict[str, Any]]:
        sanitized_texts = [str(text) for text in texts if str(text)]
        if not sanitized_texts:
            return []

        with self._write_lock, self._connection() as connection:
            payloads: list[dict[str, Any]] = []
            for text in sanitized_texts:
                timestamp = self._utc_now()
                cursor = connection.execute(
                    "INSERT INTO messages (sender, text, timestamp) VALUES (?, ?, ?)",
                    (sender, text, timestamp),
                )
                payloads.append(
                    ChatMessage(
                        id=int(cursor.lastrowid),
                        sender=sender,
                        text=text,
                        timestamp=timestamp,
                    ).to_payload()
                )

            self._trim_messages(connection)
            return payloads

    def latest(self) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, sender, text, timestamp FROM messages ORDER BY id DESC LIMIT 1"
            ).fetchone()
            return self._row_to_payload(row)

    def latest_id(self) -> int | None:
        with self._connection() as connection:
            row = connection.execute("SELECT id FROM messages ORDER BY id DESC LIMIT 1").fetchone()
            if row is None:
                return None
            return int(row["id"])

    def recent_page(self, limit: int) -> tuple[list[dict[str, Any]], bool, int | None]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT id, sender, text, timestamp FROM messages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            if not rows:
                return [], False, None

            oldest_row = connection.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1").fetchone()
            payload = [self._row_to_payload(row) for row in reversed(rows)]
            oldest_id = int(oldest_row["id"]) if oldest_row is not None else None

        has_more = bool(payload and oldest_id is not None and payload[0]["id"] > oldest_id)
        next_cursor = payload[0]["id"] if has_more else None
        return payload, has_more, next_cursor

    def before_page(self, before_id: int, limit: int) -> tuple[list[dict[str, Any]], bool, int | None]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT id, sender, text, timestamp
                FROM messages
                WHERE id < ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (before_id, limit),
            ).fetchall()
            if not rows:
                return [], False, None

            oldest_row = connection.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1").fetchone()
            payload = [self._row_to_payload(row) for row in reversed(rows)]
            oldest_id = int(oldest_row["id"]) if oldest_row is not None else None

        has_more = bool(payload and oldest_id is not None and payload[0]["id"] > oldest_id)
        next_cursor = payload[0]["id"] if has_more else None
        return payload, has_more, next_cursor

    def stats(self) -> dict[str, int]:
        with self._connection() as connection:
            stored_row = connection.execute("SELECT COUNT(*) AS stored FROM messages").fetchone()
            sequence_row = connection.execute(
                "SELECT seq FROM sqlite_sequence WHERE name = 'messages'"
            ).fetchone()

        stored = int(stored_row["stored"]) if stored_row is not None else 0
        total_count = int(sequence_row["seq"]) if sequence_row is not None else stored
        return {
            "count": total_count,
            "stored": stored,
            "storeLimit": self._max_messages,
        }

    def _trim_messages(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            DELETE FROM messages
            WHERE id IN (
                SELECT id
                FROM messages
                ORDER BY id ASC
                LIMIT (
                    SELECT CASE
                        WHEN COUNT(*) > ? THEN COUNT(*) - ?
                        ELSE 0
                    END
                    FROM messages
                )
            )
            """,
            (self._max_messages, self._max_messages),
        )

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self._database_path, timeout=30, check_same_thread=False)
        _configure_connection(connection)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _row_to_payload(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None

        return ChatMessage(
            id=int(row["id"]),
            sender=str(row["sender"]),
            text=str(row["text"]),
            timestamp=str(row["timestamp"]),
        ).to_payload()

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class ReadReceiptStore:
    def __init__(self, *, database_path: str | Path) -> None:
        self._database_path = Path(database_path)
        self._write_lock = Lock()

    def last_read_for(self, username: str | None) -> int | None:
        if not username:
            return None

        with self._connection() as connection:
            row = connection.execute(
                "SELECT last_read_id FROM read_receipts WHERE username = ?",
                (username,),
            ).fetchone()
            if row is None:
                return None
            return int(row["last_read_id"])

    def mark_read(self, username: str, message_id: int) -> int | None:
        if message_id <= 0:
            return None

        timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        with self._write_lock, self._connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO read_receipts (username, last_read_id, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    last_read_id = excluded.last_read_id,
                    updated_at = excluded.updated_at
                WHERE excluded.last_read_id > read_receipts.last_read_id
                """,
                (username, message_id, timestamp),
            )

            return message_id if cursor.rowcount else None

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self._database_path, timeout=30, check_same_thread=False)
        _configure_connection(connection)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


class BotWordlistStore:
    def __init__(self, *, database_path: str | Path) -> None:
        self._database_path = Path(database_path)
        self._write_lock = Lock()

    def save(self, username: str, filename: str, words: list[str]) -> dict[str, Any]:
        timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        line_count = len(words)
        content = "\n".join(words)

        with self._write_lock, self._connection() as connection:
            connection.execute(
                """
                INSERT INTO bot_wordlists (username, filename, content, line_count, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    filename = excluded.filename,
                    content = excluded.content,
                    line_count = excluded.line_count,
                    updated_at = excluded.updated_at
                """,
                (username, filename, content, line_count, timestamp),
            )

        return {
            "hasWordlist": True,
            "filename": filename,
            "lineCount": line_count,
            "updatedAt": timestamp,
        }

    def metadata(self, username: str) -> dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT filename, line_count, updated_at FROM bot_wordlists WHERE username = ?",
                (username,),
            ).fetchone()

        if row is None:
            return {
                "hasWordlist": False,
                "filename": None,
                "lineCount": 0,
                "updatedAt": None,
            }

        return {
            "hasWordlist": True,
            "filename": str(row["filename"]),
            "lineCount": int(row["line_count"]),
            "updatedAt": str(row["updated_at"]),
        }

    def get_words(self, username: str) -> list[str]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT content FROM bot_wordlists WHERE username = ?",
                (username,),
            ).fetchone()

        if row is None:
            return []

        content = str(row["content"])
        return [line for line in content.splitlines() if line]

    def clear(self, username: str) -> None:
        with self._write_lock, self._connection() as connection:
            connection.execute("DELETE FROM bot_wordlists WHERE username = ?", (username,))

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self._database_path, timeout=30, check_same_thread=False)
        _configure_connection(connection)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
