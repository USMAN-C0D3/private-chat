from __future__ import annotations

from threading import Lock
from typing import Any
from uuid import uuid4

from flask import current_app, request
from flask_socketio import SocketIO, disconnect, emit, join_room, leave_room

from .auth import current_user, partner_for, primary_account_username
from .bot import get_bot_manager, BotTask
from .security import request_origin_allowed
from .services import get_chat_services


_socket_users: dict[str, str] = {}
_presence_lock = Lock()
_DEFAULT_BOT_BATCH_SIZE = 200
_DEFAULT_BOT_SPEED = 3000
_MAX_BOT_BATCH_SIZE = 2000
_MAX_BOT_SPEED = 50000

def _online_users() -> list[str]:
    with _presence_lock:
        return sorted(set(_socket_users.values()))


def _emit_presence(socketio: SocketIO) -> None:
    payload = {"onlineUsers": _online_users()}
    room = current_app.config["PRIVATE_CHAT_ROOM"]
    socketio.emit("presence", payload, room=room)


def _bot_owner_username() -> str:
    return primary_account_username()


def _socket_username(auth: dict[str, Any] | None = None) -> str | None:
    del auth
    return current_user()


def _active_socket_user() -> str | None:
    return _socket_users.get(request.sid) or current_user()


def _has_other_active_socket(username: str, excluding_sid: str) -> bool:
    with _presence_lock:
        return any(sid != excluding_sid and user == username for sid, user in _socket_users.items())


def register_socket_events(socketio: SocketIO) -> None:
    @socketio.on("connect")
    def handle_connect(auth: dict[str, Any] | None = None):
        if not request_origin_allowed():
            return False

        username = _socket_username(auth)
        if not username:
            return False

        # If admin reconnects, clear any stale bot task left from a previous session.
        if username == _bot_owner_username():
            bot_manager = get_bot_manager()
            existing = bot_manager.get_bot(username)
            if existing:
                existing.is_running = False
                bot_manager.set_bot(username, None)

        with _presence_lock:
            _socket_users[request.sid] = username

        services = get_chat_services()
        partner = partner_for(username)

        join_room(current_app.config["PRIVATE_CHAT_ROOM"])
        emit(
            "chat_state",
            {
                "user": username,
                "onlineUsers": _online_users(),
                "viewerLastReadId": services.read_receipts.last_read_for(username),
                "partnerLastReadId": services.read_receipts.last_read_for(partner),
            },
        )
        _emit_presence(socketio)

    @socketio.on("disconnect")
    def handle_disconnect():
        username = _socket_users.pop(request.sid, None) or current_user()
        if username:
            # Stop bot only when admin has no more active sockets.
            if username == _bot_owner_username() and not _has_other_active_socket(username, request.sid):
                bot_manager = get_bot_manager()
                bot = bot_manager.get_bot(username)
                if bot:
                    bot.is_running = False
                    bot_manager.set_bot(username, None)

            leave_room(current_app.config["PRIVATE_CHAT_ROOM"])
            _emit_presence(socketio)

    @socketio.on("send_message")
    def handle_send_message(payload: dict[str, Any] | None = None):
        try:
            username = _active_socket_user()
            if not username:
                disconnect()
                return

            data = payload or {}
            text = str(data.get("text", "")).strip()
            reply_to_payload = data.get("replyTo")
            client_id = str(data.get("id", "")).strip() or str(data.get("clientId", "")).strip() or None

            if not client_id:
                client_id = str(uuid4())

            if not text:
                emit("chat_error", {"message": "Message text is required."})
                return

            max_length = current_app.config["MAX_MESSAGE_LENGTH"]
            if len(text) > max_length:
                emit(
                    "chat_error",
                    {"message": f"Messages are limited to {max_length} characters."},
                )
                return

            normalized_reply_to: dict[str, Any] | None = None
            if isinstance(reply_to_payload, dict):
                raw_reply_id = reply_to_payload.get("id")
                raw_reply_text = str(reply_to_payload.get("text", "")).strip()
                parsed_reply_id = str(raw_reply_id).strip() or None

                if parsed_reply_id and raw_reply_text:
                    normalized_reply_to = {
                        "id": parsed_reply_id,
                        "text": raw_reply_text[:max_length],
                    }

            services = get_chat_services()
            message = services.store.append(
                username,
                text,
                reply_to=normalized_reply_to,
                client_id=client_id,
            )
            if message is None:
                return

            if normalized_reply_to is not None:
                message["replyTo"] = normalized_reply_to
            payload = {"message": message}
            room = current_app.config["PRIVATE_CHAT_ROOM"]
            socketio.emit("receive_message", payload, room=room)
        except Exception:
            current_app.logger.exception("Unhandled error in send_message")
            emit("chat_error", {"message": "Unable to send message right now."})

    @socketio.on("typing")
    def handle_typing(payload: dict[str, Any] | None = None):
        try:
            username = _active_socket_user()
            if not username:
                disconnect()
                return

            emit(
                "typing",
                {
                    "sender": username,
                    "active": bool((payload or {}).get("active", False)),
                },
                room=current_app.config["PRIVATE_CHAT_ROOM"],
                include_self=False,
            )
        except Exception:
            current_app.logger.exception("Unhandled error in typing")

    @socketio.on("mark_read")
    def handle_mark_read(payload: dict[str, Any] | None = None):
        try:
            username = _active_socket_user()
            if not username:
                disconnect()
                return

            raw_message_id = (payload or {}).get("messageId")
            try:
                requested_message_id = int(raw_message_id)
            except (TypeError, ValueError):
                return

            services = get_chat_services()
            latest_message_id = services.store.latest_id()
            if latest_message_id is None:
                return

            normalized_message_id = min(max(requested_message_id, 1), latest_message_id)
            marked_message_id = services.read_receipts.mark_read(username, normalized_message_id)
            if marked_message_id is None:
                return

            socketio.emit(
                "messages_read",
                {
                    "reader": username,
                    "messageId": marked_message_id,
                },
                room=current_app.config["PRIVATE_CHAT_ROOM"],
            )
        except Exception:
            current_app.logger.exception("Unhandled error in mark_read")

    @socketio.on("start_bot")
    def handle_start_bot(payload: dict[str, Any] | None = None):
        """Start bot message flooding for admin user"""
        try:
            username = _active_socket_user()
            if not username:
                disconnect()
                return

            if username != _bot_owner_username():
                emit("bot_error", {"message": "Unauthorized"})
                return

            # Stop any existing bot
            bot_manager = get_bot_manager()
            existing = bot_manager.get_bot(username)
            if existing:
                existing.is_running = False
                bot_manager.set_bot(username, None)

            data = payload or {}
            words = _resolve_bot_words(username, data)
            app = current_app._get_current_object()
            speed = data.get("speed", _DEFAULT_BOT_SPEED)
            target = data.get("target", 21600)
            mode = data.get("mode", "sequential")
            delay = data.get("delay", 0)
            batch_size = data.get("batchSize", app.config.get("BOT_EMIT_BATCH_SIZE", _DEFAULT_BOT_BATCH_SIZE))
            try:
                speed = int(speed)
            except (TypeError, ValueError):
                speed = _DEFAULT_BOT_SPEED
            try:
                batch_size = int(batch_size)
            except (TypeError, ValueError):
                batch_size = _DEFAULT_BOT_BATCH_SIZE
            try:
                target = int(target)
            except (TypeError, ValueError):
                target = 21600
            try:
                delay = float(delay)
            except (TypeError, ValueError):
                delay = 0

            speed = max(0, min(speed, _MAX_BOT_SPEED))
            batch_size = max(1, min(batch_size, _MAX_BOT_BATCH_SIZE))
            target = max(1, target)
            delay = max(0.0, delay)

            if len(words) == 0:
                emit("bot_error", {"message": "Invalid wordlist"})
                return

            room = app.config["PRIVATE_CHAT_ROOM"]

            # Create and start bot task
            bot = BotTask(
                username=username,
                words=words,
                speed=speed,
                target=target,
                mode=mode,
                delay=delay,
            )
            bot.speed = speed
            bot.batch_size = batch_size
            bot.is_running = True
            bot_manager.set_bot(username, bot)

            # Start background task
            socketio.start_background_task(
                _run_bot_task,
                app,
                socketio,
                bot,
                username,
                room,
            )

            emit("bot_started", {"count": 0})

        except Exception:
            current_app.logger.exception("Unhandled error in start_bot")
            emit("bot_error", {"message": "Failed to start bot"})

    @socketio.on("stop_bot")
    def handle_stop_bot():
        """Stop bot for current user"""
        try:
            username = _active_socket_user()
            if not username:
                disconnect()
                return

            if username != _bot_owner_username():
                emit("bot_error", {"message": "Unauthorized"})
                return

            bot_manager = get_bot_manager()
            bot = bot_manager.get_bot(username)
            if bot:
                bot.is_running = False
                bot_manager.set_bot(username, None)
                emit("bot_stopped", {"count": bot.message_count})

        except Exception:
            current_app.logger.exception("Unhandled error in stop_bot")


def _run_bot_task(app, socketio: SocketIO, bot: BotTask, username: str, room: str) -> None:
    """Background task that sends bot messages"""
    with app.app_context():
        try:
            services = get_chat_services()
            bot_manager = get_bot_manager()
            batch_size = max(1, min(int(getattr(bot, "batch_size", _DEFAULT_BOT_BATCH_SIZE)), _MAX_BOT_BATCH_SIZE))
            progress_interval = app.config["BOT_PROGRESS_INTERVAL"]
            last_progress_count = 0

            # Initial delay
            if bot.delay > 0:
                socketio.sleep(bot.delay)

            # Main loop
            while True:
                # Hard stop conditions
                if not bot.is_running:
                    break

                current_bot = bot_manager.get_bot(username)
                if current_bot is None or current_bot != bot:
                    break

                if bot.message_count >= bot.target:
                    break

                remaining = bot.target - bot.message_count
                current_batch_size = min(batch_size, remaining)
                texts = [bot.get_next_message() for _ in range(current_batch_size)]

                messages = services.store.append_many(username, texts)
                if not messages:
                    continue

                bot.message_count += len(messages)

                socketio.emit("receive_messages", {"messages": messages}, room=room)

                if bot.message_count - last_progress_count >= progress_interval or bot.message_count >= bot.target:
                    last_progress_count = bot.message_count
                    socketio.emit("bot_progress", {"count": bot.message_count}, room=room)

                if bot.speed > 0:
                    socketio.sleep(len(messages) / bot.speed)
                else:
                    socketio.sleep(0)

            # Clean exit
            bot.is_running = False
            bot_manager.set_bot(username, None)

            # Notify client
            socketio.emit(
                "bot_stopped",
                {"count": bot.message_count},
                room=room,
            )

        except Exception:
            app.logger.exception("Unhandled error in bot task")


def _resolve_bot_words(username: str, payload: dict[str, Any]) -> list[str]:
    use_uploaded_wordlist = bool(payload.get("useUploadedWordlist"))
    inline_words = payload.get("words", [])
    if isinstance(inline_words, list):
        normalized_inline_words = [str(word).strip() for word in inline_words if str(word).strip()]
    else:
        normalized_inline_words = []

    if normalized_inline_words and not use_uploaded_wordlist:
        return normalized_inline_words

    services = get_chat_services()
    stored_words = services.bot_wordlists.get_words(username)
    if stored_words:
        return stored_words

    return normalized_inline_words
