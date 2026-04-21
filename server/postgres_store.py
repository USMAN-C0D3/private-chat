import importlib
from contextlib import contextmanager
from datetime import datetime
from threading import Lock
from typing import Any, Iterable


def _connection_pool_class():
    pool_module = importlib.import_module("psycopg2.pool")
    return pool_module.SimpleConnectionPool


class PostgresChatStore:
    def __init__(self, database_url: str, *, max_messages: int = 100_000):
        self.database_url = database_url
        self._max_messages = max_messages
        self._pool = _connection_pool_class()(1, 10, dsn=database_url)
        self._write_lock = Lock()

    @contextmanager
    def _connection(self):
        connection = self._pool.getconn()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            self._pool.putconn(connection)

    @staticmethod
    def _timestamp(value: Any) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)

    def append(self, sender: str, text: str, reply_to: dict[str, Any] | None = None) -> dict[str, Any]:
        reply_to_id = None
        reply_to_text = None
        if isinstance(reply_to, dict):
            raw_reply_id = reply_to.get("id")
            raw_reply_text = str(reply_to.get("text", "")).strip()
            try:
                parsed_reply_id = int(raw_reply_id)
            except (TypeError, ValueError):
                parsed_reply_id = None

            if parsed_reply_id and parsed_reply_id > 0 and raw_reply_text:
                reply_to_id = parsed_reply_id
                reply_to_text = raw_reply_text

        with self._write_lock, self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO messages (sender, text, reply_to_id, reply_to_text)
                VALUES (%s, %s, %s, %s)
                RETURNING id, created_at, reply_to_id, reply_to_text
                """,
                (sender, text, reply_to_id, reply_to_text),
            )

            msg_id, created_at, stored_reply_id, stored_reply_text = cur.fetchone()
            cur.close()

            self._trim_messages(conn)

        return {
            "id": msg_id,
            "sender": sender,
            "text": text,
            "timestamp": self._timestamp(created_at),
            "replyTo": (
                {"id": int(stored_reply_id), "text": str(stored_reply_text)}
                if stored_reply_id is not None and stored_reply_text is not None
                else None
            ),
        }

    def append_many(self, sender: str, texts: Iterable[str]) -> list[dict[str, Any]]:
        payloads: list[dict[str, Any]] = []
        for text in texts:
            normalized_text = str(text).strip()
            if normalized_text:
                payloads.append(self.append(sender, normalized_text))
        return payloads

    def recent_page(self, limit: int):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, sender, text, created_at, reply_to_id, reply_to_text
                FROM messages
                ORDER BY id DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            cur.close()

            if not rows:
                return [], False, None

            oldest_row = conn.cursor()
            oldest_row.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1")
            oldest = oldest_row.fetchone()
            oldest_row.close()

        rows.reverse()
        messages = [self._row_to_payload(row) for row in rows]
        oldest_id = int(oldest[0]) if oldest is not None else None
        has_more = bool(messages and oldest_id is not None and messages[0]["id"] > oldest_id)
        next_cursor = messages[0]["id"] if has_more else None
        return messages, has_more, next_cursor

    def before_page(self, before_id: int, limit: int):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, sender, text, created_at, reply_to_id, reply_to_text
                FROM messages
                WHERE id < %s
                ORDER BY id DESC
                LIMIT %s
                """,
                (before_id, limit),
            )
            rows = cur.fetchall()
            cur.close()

            if not rows:
                return [], False, None

            oldest_row = conn.cursor()
            oldest_row.execute("SELECT id FROM messages ORDER BY id ASC LIMIT 1")
            oldest = oldest_row.fetchone()
            oldest_row.close()

        rows.reverse()
        messages = [self._row_to_payload(row) for row in rows]
        oldest_id = int(oldest[0]) if oldest is not None else None
        has_more = bool(messages and oldest_id is not None and messages[0]["id"] > oldest_id)
        next_cursor = messages[0]["id"] if has_more else None
        return messages, has_more, next_cursor

    def latest(self):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, sender, text, created_at, reply_to_id, reply_to_text
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

    def latest_id(self) -> int | None:
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM messages ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            cur.close()

        if not row:
            return None

        return int(row[0])

    def stats(self) -> dict[str, int]:
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM messages")
            stored = int(cur.fetchone()[0] or 0)
            cur.close()

        return {
            "count": stored,
            "stored": stored,
            "storeLimit": self._max_messages,
        }

    def _trim_messages(self, conn) -> None:
        conn.cursor().execute(
            """
            DELETE FROM messages
            WHERE id IN (
                SELECT id
                FROM messages
                ORDER BY id ASC
                LIMIT GREATEST(
                    (SELECT COUNT(*) FROM messages) - %s,
                    0
                )
            )
            """,
            (self._max_messages,),
        )

    @staticmethod
    def _row_to_payload(row) -> dict[str, Any]:
        reply_to_id = row[4] if len(row) > 4 else None
        reply_to_text = row[5] if len(row) > 5 else None
        return {
            "id": int(row[0]),
            "sender": str(row[1]),
            "text": str(row[2]),
            "timestamp": PostgresChatStore._timestamp(row[3]),
            "replyTo": (
                {"id": int(reply_to_id), "text": str(reply_to_text)}
                if reply_to_id is not None and reply_to_text is not None
                else None
            ),
        }