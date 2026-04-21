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
        if isinstance(value, datetime):
            return value.isoformat()
        return str(value)

    def append(self, sender: str, text: str, reply_to=None):
        reply_to_id = None
        reply_to_text = None

        if isinstance(reply_to, dict):
            try:
                reply_to_id = int(reply_to.get("id"))
                reply_to_text = str(reply_to.get("text", ""))
            except:
                pass

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

            msg_id, created_at, r_id, r_text = cur.fetchone()
            cur.close()

            self._trim_messages(conn)

        return {
            "id": msg_id,
            "sender": sender,
            "text": text,
            "timestamp": self._timestamp(created_at),
            "replyTo": (
                {"id": r_id, "text": r_text}
                if r_id is not None and r_text is not None
                else None
            ),
        }

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

        rows.reverse()

        messages = [self._row_to_payload(r) for r in rows]
        return messages, False, None

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

    def latest_id(self):
        with self._connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM messages ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            cur.close()

        return int(row[0]) if row else None

    def _trim_messages(self, conn):
        conn.cursor().execute(
            """
            DELETE FROM messages
            WHERE id IN (
                SELECT id FROM messages
                ORDER BY id ASC
                LIMIT GREATEST((SELECT COUNT(*) FROM messages) - %s, 0)
            )
            """,
            (self._max_messages,),
        )

    @staticmethod
    def _row_to_payload(row):
        return {
            "id": int(row[0]),
            "sender": str(row[1]),
            "text": str(row[2]),
            "timestamp": PostgresChatStore._timestamp(row[3]),
            "replyTo": (
                {"id": row[4], "text": row[5]}
                if row[4] is not None and row[5] is not None
                else None
            ),
        }