from __future__ import annotations

import io
import shutil
import time
import unittest
from datetime import timedelta
from pathlib import Path

from werkzeug.security import generate_password_hash

from server import create_app
from server.accounts import PrivateAccount


class BackendIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_root = Path.cwd() / ".tmp-tests" / f"run-{int(time.time() * 1000)}"
        self.test_root.mkdir(parents=True, exist_ok=True)
        database_path = self.test_root / "test.sqlite3"

        class TestConfig:
            APP_ENV = "testing"
            TESTING = True
            DEBUG = False
            SECRET_KEY = "test-secret"
            TRUST_PROXY_HEADERS = False
            DATABASE_PATH = database_path
            SESSION_COOKIE_HTTPONLY = True
            SESSION_COOKIE_NAME = "test_private_chat_session"
            SESSION_COOKIE_SAMESITE = "Lax"
            SESSION_COOKIE_SECURE = False
            SESSION_REFRESH_EACH_REQUEST = False
            PERMANENT_SESSION_LIFETIME = timedelta(days=1)
            PREFERRED_URL_SCHEME = "http"
            FRONTEND_DIST_DIR = Path.cwd() / "dist"
            FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"
            CHAT_STORE_LIMIT = 100_000
            CHAT_HISTORY_PAGE_SIZE = 80
            CHAT_HISTORY_MAX_PAGE_SIZE = 200
            MAX_MESSAGE_LENGTH = 2_000
            PRIVATE_CHAT_ROOM = "private-two-user-thread"
            CSRF_HEADER_NAME = "X-CSRF-Token"
            LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60
            LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 3
            SOCKET_IO_CORS_ORIGINS = ["http://localhost"]
            SOCKET_IO_PING_INTERVAL = 25
            SOCKET_IO_PING_TIMEOUT = 20
            SOCKET_IO_MAX_HTTP_BUFFER_SIZE = 2_000_000
            BOT_EMIT_BATCH_SIZE = 10
            BOT_PROGRESS_INTERVAL = 5
            BOT_WORDLIST_MAX_UPLOAD_BYTES = 5_000_000
            BOT_WORDLIST_MAX_LINES = 100_000
            PRIVATE_ACCOUNTS = {
                "usman": PrivateAccount(
                    username="usman",
                    display_name="Usman",
                    password_hash=generate_password_hash("usman-secret"),
                ),
                "aisha": PrivateAccount(
                    username="aisha",
                    display_name="Aisha",
                    password_hash=generate_password_hash("aisha-secret"),
                ),
            }

        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        self.socketio = self.app.extensions["socketio"]

    def tearDown(self) -> None:
        shutil.rmtree(self.test_root, ignore_errors=True)

    def _csrf_token(self, client) -> str:
        response = client.get("/api/auth/session")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, dict)
        token = payload.get("csrfToken")
        self.assertIsInstance(token, str)
        self.assertTrue(token)
        return token

    def _login(self, client, username: str, password: str):
        csrf_token = self._csrf_token(client)
        return client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
            headers={"X-CSRF-Token": csrf_token},
        )

    def _upload_bot_wordlist(self, client, content: str, filename: str = "wordlist.txt"):
        csrf_token = self._csrf_token(client)
        return client.post(
            "/api/bot/wordlist",
            data={"file": (io.BytesIO(content.encode("utf-8")), filename)},
            content_type="multipart/form-data",
            headers={"X-CSRF-Token": csrf_token},
        )

    def test_login_requires_csrf_token(self) -> None:
        response = self.client.post(
            "/api/auth/login",
            json={"username": "usman", "password": "usman-secret"},
        )
        self.assertEqual(response.status_code, 400)

    def test_readiness_endpoint_reports_database_health(self) -> None:
        response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["database"], "ok")

    def test_login_rate_limit_engages(self) -> None:
        for _ in range(3):
            response = self._login(self.client, "usman", "wrong-password")
            self.assertEqual(response.status_code, 401)

        limited = self._login(self.client, "usman", "wrong-password")
        self.assertEqual(limited.status_code, 429)
        payload = limited.get_json()
        self.assertGreater(payload.get("retryAfterSeconds", 0), 0)

    def test_socket_message_flow_and_read_receipts(self) -> None:
        client_one = self.app.test_client()
        client_two = self.app.test_client()

        login_one = self._login(client_one, "usman", "usman-secret")
        login_two = self._login(client_two, "aisha", "aisha-secret")
        self.assertEqual(login_one.status_code, 200)
        self.assertEqual(login_two.status_code, 200)

        socket_one = self.socketio.test_client(self.app, flask_test_client=client_one)
        socket_two = self.socketio.test_client(self.app, flask_test_client=client_two)

        try:
            self.assertTrue(socket_one.is_connected())
            self.assertTrue(socket_two.is_connected())

            socket_one.get_received()
            socket_two.get_received()

            socket_one.emit("send_message", {"text": "hello from usman"})

            events_one = socket_one.get_received()
            events_two = socket_two.get_received()

            receive_one = [event for event in events_one if event["name"] == "receive_message"]
            receive_two = [event for event in events_two if event["name"] == "receive_message"]

            self.assertTrue(receive_one)
            self.assertTrue(receive_two)
            self.assertEqual(len(receive_one), 1)
            self.assertEqual(len(receive_two), 1)

            message_id = receive_two[0]["args"][0]["message"]["id"]
            message_sequence = receive_two[0]["args"][0]["message"]["sequence"]
            self.assertIsInstance(message_id, str)
            self.assertIsInstance(receive_two[0]["args"][0]["message"]["timestamp"], int)
            socket_two.get_received()

            socket_two.emit(
                "send_message",
                {
                    "text": "reply from aisha",
                    "replyTo": {"id": message_id, "text": "hello from usman"},
                },
            )

            reply_events = socket_one.get_received() + socket_two.get_received()
            reply_messages = [event for event in reply_events if event["name"] == "receive_message"]
            self.assertTrue(reply_messages)
            reply_payload = reply_messages[-1]["args"][0]["message"]
            self.assertEqual(reply_payload["replyTo"]["id"], message_id)
            self.assertEqual(reply_payload["replyTo"]["text"], "hello from usman")

            socket_two.emit("mark_read", {"messageId": message_sequence})

            read_events_one = socket_one.get_received()
            read_events_two = socket_two.get_received()
            combined = read_events_one + read_events_two
            receipt_events = [event for event in combined if event["name"] == "messages_read"]

            self.assertTrue(receipt_events)
            self.assertEqual(receipt_events[-1]["args"][0]["reader"], "aisha")
            self.assertEqual(receipt_events[-1]["args"][0]["messageId"], message_sequence)
        finally:
            socket_one.disconnect()
            socket_two.disconnect()

    def test_bot_emits_live_messages(self) -> None:
        admin_client = self.app.test_client()
        login_response = self._login(admin_client, "usman", "usman-secret")
        self.assertEqual(login_response.status_code, 200)

        upload_response = self._upload_bot_wordlist(admin_client, "alpha\nbeta\ngamma\n")
        self.assertEqual(upload_response.status_code, 200)
        upload_payload = upload_response.get_json()
        self.assertEqual(upload_payload["lineCount"], 3)
        self.assertEqual(upload_payload["filename"], "wordlist.txt")

        socket_client = self.socketio.test_client(self.app, flask_test_client=admin_client)
        try:
            self.assertTrue(socket_client.is_connected())
            socket_client.get_received()
            socket_client.emit(
                "start_bot",
                {
                    "speed": 1000,
                    "target": 20,
                    "mode": "sequential",
                    "useUploadedWordlist": True,
                },
            )

            received_events: list[dict] = []
            deadline = time.time() + 3
            while time.time() < deadline:
                batch = socket_client.get_received()
                if batch:
                    received_events.extend(batch)
                    if any(event["name"] == "bot_stopped" for event in batch):
                        break
                time.sleep(0.05)

            self.assertTrue(any(event["name"] == "receive_message" for event in received_events))
            self.assertTrue(any(event["name"] == "bot_stopped" for event in received_events))
        finally:
            socket_client.disconnect()


if __name__ == "__main__":
    unittest.main()
