from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from flask import current_app
from flask_socketio import SocketIO

from .store import BotWordlistStore, ChatStore, ReadReceiptStore, init_store_database


@dataclass(slots=True)
class ChatServices:
    store: ChatStore
    read_receipts: ReadReceiptStore
    bot_wordlists: BotWordlistStore


def create_chat_services(config: dict[str, Any], socketio: SocketIO) -> ChatServices:
    del socketio
    database_path = config["DATABASE_PATH"]
    init_store_database(database_path)
    return ChatServices(
        store=ChatStore(
            database_path=database_path,
            max_messages=config["CHAT_STORE_LIMIT"],
        ),
        read_receipts=ReadReceiptStore(database_path=database_path),
        bot_wordlists=BotWordlistStore(database_path=database_path),
    )


def get_chat_services() -> ChatServices:
    return current_app.extensions["chat_services"]
