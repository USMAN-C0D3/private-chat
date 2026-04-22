from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
import time
from typing import Any, Iterable
from uuid import uuid4


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
                public_id TEXT UNIQUE,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                reply_to_id INTEGER,
                reply_to_public_id TEXT,
                client_id TEXT,
                reply_to_text TEXT
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
        _ensure_reply_columns(connection)
        connection.commit()
    finally:
        connection.close()


def _configure_connection(connection: sqlite3.Connection) -> None:
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=30000")


def _ensure_reply_columns(connection: sqlite3.Connection) -> None:
    table_info = connection.execute("PRAGMA table_info(messages)").fetchall()
    existing_columns = {str(row["name"]) for row in table_info}

    if "public_id" not in existing_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN public_id TEXT")

    if "reply_to_id" not in existing_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER")

    if "reply_to_public_id" not in existing_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN reply_to_public_id TEXT")

    if "reply_to_text" not in existing_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN reply_to_text TEXT")

    if "client_id" not in existing_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN client_id TEXT")

    rows_missing_public_id = connection.execute(
        "SELECT id FROM messages WHERE public_id IS NULL OR public_id = ''"
    ).fetchall()
    for row in rows_missing_public_id:
        connection.execute(
            "UPDATE messages SET public_id = ? WHERE id = ?",
            (str(uuid4()), int(row["id"])),
        )

    connection.execute(
        """
        UPDATE messages
        SET reply_to_public_id = (
            SELECT parent.public_id
            FROM messages AS parent
            WHERE parent.id = messages.reply_to_id
        )
        WHERE reply_to_public_id IS NULL
          AND reply_to_id IS NOT NULL
        """
    )
    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_public_id ON messages(public_id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_id)"
    )


@dataclass(slots=True, frozen=True)
class ChatReplyTo:
    id: str
    text: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
        }


@dataclass(slots=True, frozen=True)
class ChatMessage:
    id: str
    sequence: int
    sender: str
    text: str
    timestamp: int
    client_id: str | None = None
    reply_to: ChatReplyTo | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sequence": self.sequence,
            "sender": self.sender,
            "text": self.text,
            "timestamp": self.timestamp,
            "clientId": self.client_id,
            "replyTo": self.reply_to.to_payload() if self.reply_to else None,
        }


class ChatStore:
    def __init__(self, *, database_path: str | Path, max_messages: int) -> None:
        self._database_path = Path(database_path)
        self._max_messages = max_messages
        self._write_lock = Lock()

    def append(
        self,
        sender: str,
        text: str,
        reply_to: dict[str, Any] | None = None,
        *,
        client_id: str | None = None,
    ) -> dict[str, Any] | None:
        normalized_text = str(text)
        if not normalized_text:
            raise ValueError("Message text is required")

        reply_to_id: int | None = None
        reply_to_public_id: str | None = None
        reply_to_text: str | None = None
        if isinstance(reply_to, dict):
            raw_id = reply_to.get("id")
            raw_text = str(reply_to.get("text", "")).strip()
            parsed_id = str(raw_id).strip() or None

            if parsed_id and raw_text:
                reply_to_public_id = parsed_id
                reply_to_text = raw_text

        with self._write_lock, self._connection() as connection:
            if client_id:
                existing_by_client = connection.execute(
                    """
                    SELECT id, public_id, sender, text, timestamp, reply_to_id, reply_to_public_id, client_id, reply_to_text
                    FROM messages
                    WHERE client_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (client_id,),
                ).fetchone()
                if existing_by_client is not None:
                    return self._row_to_payload(existing_by_client)

            if reply_to_public_id:
                parent_row = connection.execute(
                    "SELECT id FROM messages WHERE public_id = ? LIMIT 1",
                    (reply_to_public_id,),
                ).fetchone()
                if parent_row is not None:
                    reply_to_id = int(parent_row["id"])

            timestamp = self._timestamp_ms()
            public_id = str(uuid4())
            cursor = connection.execute(
                """
                INSERT INTO messages (
                    public_id,
                    sender,
                    text,
                    timestamp,
                    reply_to_id,
                    reply_to_public_id,
                    client_id,
                    reply_to_text
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(public_id) DO NOTHING
                """,
                (public_id, sender, normalized_text, timestamp, reply_to_id, reply_to_public_id, client_id, reply_to_text),
            )
            if cursor.rowcount == 0:
                return None

            self._trim_messages(connection)

            return ChatMessage(
                id=public_id,
                sequence=int(cursor.lastrowid),
                sender=sender,
                text=normalized_text,
                timestamp=timestamp,
                client_id=client_id,
                reply_to=(
                    ChatReplyTo(id=reply_to_public_id, text=reply_to_text)
                    if reply_to_public_id is not None and reply_to_text is not None
                    else None
                ),
            ).to_payload()

    def append_many(self, sender: str, texts: Iterable[str]) -> list[dict[str, Any]]:
        sanitized_texts = [str(text) for text in texts if str(text)]
        if not sanitized_texts:
            return []

        with self._write_lock, self._connection() as connection:
            payloads: list[dict[str, Any]] = []
            for text in sanitized_texts:
                timestamp = self._timestamp_ms()
                public_id = str(uuid4())
                cursor = connection.execute(
                    """
                    INSERT INTO messages (
                        public_id,
                        sender,
                        text,
                        timestamp,
                        reply_to_id,
                        reply_to_public_id,
                        client_id,
                        reply_to_text
                    )
                    VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL)
                    """,
                    (public_id, sender, text, timestamp),
                )

                payloads.append(
                    ChatMessage(
                        id=str(public_id),
                        sequence=int(cursor.lastrowid),
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
                """
                SELECT id, public_id, sender, text, timestamp, reply_to_id, reply_to_public_id, client_id, reply_to_text
                FROM messages
                ORDER BY id DESC
                LIMIT 1
                """
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
                """
                SELECT id, public_id, sender, text, timestamp, reply_to_id, reply_to_public_id, client_id, reply_to_text
                FROM messages
                ORDER BY id DESC
                LIMIT ?
                """,
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
                SELECT id, public_id, sender, text, timestamp, reply_to_id, reply_to_public_id, client_id, reply_to_text
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
            id=str(row["public_id"] or row["id"]),
            sequence=int(row["id"]),
            sender=str(row["sender"]),
            text=str(row["text"]),
            timestamp=ChatStore._normalize_timestamp(row["timestamp"]),
            client_id=(str(row["client_id"]) if row["client_id"] is not None else None),
            reply_to=(
                ChatReplyTo(
                    id=str(row["reply_to_public_id"] or row["reply_to_id"]),
                    text=str(row["reply_to_text"]),
                )
                if (row["reply_to_public_id"] is not None or row["reply_to_id"] is not None) and row["reply_to_text"] is not None
                else None
            ),
        ).to_payload()

    @staticmethod
    def _timestamp_ms() -> int:
        return int(time.time() * 1000)

    @staticmethod
    def _normalize_timestamp(value: Any) -> int:
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            if value.isdigit():
                return int(value)
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return int(parsed.timestamp() * 1000)
            except ValueError:
                return ChatStore._timestamp_ms()
        return ChatStore._timestamp_ms()


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
