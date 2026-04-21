import psycopg2


class PostgresChatStore:
    def __init__(self, database_url):
        self.database_url = database_url

    def _conn(self):
        return psycopg2.connect(self.database_url)

    # ✅ FIXED: removed receiver column
    def append(self, sender, text, reply_to=None):
        conn = self._conn()
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO messages (sender, text)
            VALUES (%s, %s)
            RETURNING id, created_at
            """,
            (sender, text),
        )

        msg_id, created_at = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()

        return {
            "id": msg_id,
            "sender": sender,
            "text": text,
            "timestamp": created_at.isoformat(),
            "replyTo": reply_to,
        }

    def recent_page(self, limit):
        conn = self._conn()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, sender, text, created_at
            FROM messages
            ORDER BY id DESC
            LIMIT %s
            """,
            (limit,),
        )

        rows = cur.fetchall()
        cur.close()
        conn.close()

        rows.reverse()

        messages = [
            {
                "id": r[0],
                "sender": r[1],
                "text": r[2],
                "timestamp": r[3].isoformat(),
                "replyTo": None,
            }
            for r in rows
        ]

        return messages, False, None

    def latest(self):
        conn = self._conn()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT sender, text, created_at
            FROM messages
            ORDER BY created_at DESC
            LIMIT 1
            """
        )

        row = cur.fetchone()

        cur.close()
        conn.close()

        if not row:
            return None

        return {
            "sender": row[0],
            "text": row[1],
            "timestamp": row[2].isoformat(),
        }