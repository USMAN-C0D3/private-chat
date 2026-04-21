from __future__ import annotations

import importlib
import time
from contextlib import contextmanager
from datetime import datetime
from threading import Lock
from typing import Any, Iterable
from uuid import uuid4


def _connection_pool_class():
    pool_module = importlib.import_module("psycopg2.pool")
    return pool_module.SimpleConnectionPool


class PostgresChatStore:
    def __init__(self, database_url: str, *, max_messages: int = 100_000):
        self.database_url = database_url
        self._max_messages = max_messages
        self._pool = _connection_pool_class()(1, 10, dsn=database_url)
        self._write_lock = Lock()
        self._ensure_schema()

    @contextmanager
    def _connection(self):
        connection = None
        try:
            connection = self._pool.getconn()

            try:
                health_cursor = connection.cursor()
                health_cursor.execute("SELECT 1")
                health_cursor.close()
            except Exception:
                try:
                    self._pool.putconn(connection, close=True)
                except Exception:
                    pass
                connection = self._pool.getconn()

            yield connection
            connection.commit()
        except Exception:
            if connection is not None:
                try:
                    connection.rollback()
                except Exception:
                    pass
            raise
        finally:
            if connection is not None:
                try:
                    self._pool.putconn(connection, close=False)
                except Exception:
                    pass

    def _ensure_schema(self) -> None:
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS public_id TEXT")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_public_id TEXT")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id TEXT")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_public_id ON messages(public_id)")
            cur.execute("SELECT id FROM messages WHERE public_id IS NULL OR public_id = ''")
            rows = cur.fetchall()
            for row in rows:
                cur.execute(
                    "UPDATE messages SET public_id = %s WHERE id = %s",
                    (str(uuid4()), int(row[0])),
                )
            cur.execute(
                """
                UPDATE messages AS child
                SET reply_to_public_id = parent.public_id
                FROM messages AS parent
                WHERE child.reply_to_public_id IS NULL
                  AND child.reply_to_id = parent.id
                """
            )
            cur.close()

    @staticmethod
    def _timestamp_ms(value: Any = None) -> int:
        if value is None:
            return int(time.time() * 1000)
        if isinstance(value, datetime):
            return int(value.timestamp() * 1000)
        if isinstance(value, (int, float)):
            return int(value)
        value_as_text = str(value)
        if value_as_text.isdigit():
            return int(value_as_text)
        try:
            return int(datetime.fromisoformat(value_as_text.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return int(time.time() * 1000)

    def append(
        self,
        sender: str,
        text: str,
        reply_to: dict[str, Any] | None = None,
        *,
        client_id: str | None = None,
    ):
        reply_to_id = None
        reply_to_public_id = None
        reply_to_text = None

        if isinstance(reply_to, dict):
            reply_to_public_id = str(reply_to.get("id", "")).strip() or None
            reply_to_text = str(reply_to.get("text", "")).strip() or None

        with self._write_lock, self._connection() as conn:
            cur = conn.cursor()
            if reply_to_public_id:
                cur.execute("SELECT id FROM messages WHERE public_id = %s LIMIT 1", (reply_to_public_id,))
                row = cur.fetchone()
                if row:
                    reply_to_id = int(row[0])

            public_id = str(uuid4())
            timestamp = self._timestamp_ms()
            cur.execute(
                """
                INSERT INTO messages (public_id, sender, text, reply_to_id, reply_to_public_id, reply_to_text, client_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (public_id, sender, text, reply_to_id, reply_to_public_id, reply_to_text, client_id),
            )
            sequence_id, created_at = cur.fetchone()
            cur.close()

            self._trim_messages(conn)

        return {
            "id": public_id,
            "sequence": int(sequence_id),
            "sender": sender,
            "text": text,
            "timestamp": self._timestamp_ms(created_at) if created_at is not None else timestamp,
            "clientId": client_id,
            "replyTo": (
                {"id": reply_to_public_id, "text": reply_to_text}
                if reply_to_public_id is not None and reply_to_text is not None
                else None
            ),
        }

    def append_many(self, sender: str, texts: Iterable[str]):
        messages = []
        for text in texts:
            normalized = str(text).strip()
            if not normalized:
                continue
            messages.append(self.append(sender, normalized))
        return messages

    def recent_page(self, limit: int):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, public_id, sender, text, created_at, reply_to_id, reply_to_public_id, client_id, reply_to_text
                FROM messages
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            cur.close()

        rows.reverse()
        messages = [self._row_to_payload(r) for r in rows]
        if not messages:
            return [], False, None

        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1")
            oldest = cur.fetchone()
            cur.close()

        oldest_id = int(oldest[0]) if oldest else None
        has_more = bool(messages and oldest_id is not None and messages[0]["sequence"] > oldest_id)
        next_cursor = messages[0]["sequence"] if has_more else None
        return messages, has_more, next_cursor

    def before_page(self, before_id: int, limit: int):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, public_id, sender, text, created_at, reply_to_id, reply_to_public_id, client_id, reply_to_text
                FROM messages
                WHERE id < %s
                ORDER BY id DESC
                LIMIT %s
                """,
                (before_id, limit),
            )
            rows = cur.fetchall()
            cur.close()

        rows.reverse()
        messages = [self._row_to_payload(r) for r in rows]
        if not messages:
            return [], False, None

        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1")
            oldest = cur.fetchone()
            cur.close()

        oldest_id = int(oldest[0]) if oldest else None
        has_more = bool(messages and oldest_id is not None and messages[0]["sequence"] > oldest_id)
        next_cursor = messages[0]["sequence"] if has_more else None
        return messages, has_more, next_cursor

    def latest(self):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, public_id, sender, text, created_at, reply_to_id, reply_to_public_id, client_id, reply_to_text
                FROM messages
                ORDER BY id DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()
            cur.close()

        if not row:
            return None
        return self._row_to_payload(row)

    def latest_id(self):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM messages ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            cur.close()
        return int(row[0]) if row else None

    def stats(self) -> dict[str, int]:
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM messages")
            stored = int(cur.fetchone()[0])
            cur.execute("SELECT COALESCE(MAX(id), 0) FROM messages")
            total = int(cur.fetchone()[0])
            cur.close()

        return {
            "count": total,
            "stored": stored,
            "storeLimit": self._max_messages,
        }

    def _trim_messages(self, conn):
        cur = conn.cursor()
        cur.execute(
            """
            DELETE FROM messages
            WHERE id IN (
                SELECT id
                FROM messages
                ORDER BY id ASC
                LIMIT GREATEST((SELECT COUNT(*) FROM messages) - %s, 0)
            )
            """,
            (self._max_messages,),
        )
        cur.close()

    @classmethod
    def _row_to_payload(cls, row):
        return {
            "id": str(row[1] or row[0]),
            "sequence": int(row[0]),
            "sender": str(row[2]),
            "text": str(row[3]),
            "timestamp": cls._timestamp_ms(row[4]),
            "clientId": str(row[7]) if row[7] is not None else None,
            "replyTo": (
                {"id": str(row[6] or row[5]), "text": str(row[8])}
                if (row[6] is not None or row[5] is not None) and row[8] is not None
                else None
            ),
        }
