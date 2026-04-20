import random
from typing import Optional
from threading import Lock


class BotManager:
    """Manages active bot instances per user"""

    def __init__(self):
        self._bots: dict[str, "BotTask"] = {}
        self._lock = Lock()

    def get_bot(self, username: str) -> Optional["BotTask"]:
        """Get bot task for user, if running"""
        with self._lock:
            return self._bots.get(username)

    def set_bot(self, username: str, task: Optional["BotTask"]) -> None:
        """Set bot task for user"""
        with self._lock:
            if task is None:
                self._bots.pop(username, None)
            else:
                self._bots[username] = task

    def is_running(self, username: str) -> bool:
        """Check if bot is running for user"""
        with self._lock:
            return username in self._bots


class BotTask:
    """Represents a single bot sending task"""

    def __init__(
        self,
        username: str,
        words: list[str],
        speed: float,
        target: int,
        mode: str,
        delay: float = 0,
    ):
        self.username = username
        self.words = words
        self.speed = max(1, min(1000, speed))  # Clamp 1-1000 msgs/sec
        self.target = max(1, min(100000, target))  # Clamp 1-100k messages
        self.mode = mode  # "sequential" or "random"
        self.delay = max(0, delay)  # Initial delay in seconds
        self.is_running = False
        self.message_count = 0
        self.word_index = 0  # For sequential mode

    def get_next_message(self) -> str:
        """Get next message from wordlist based on mode"""
        if self.mode == "random":
            return random.choice(self.words)
        else:  # sequential
            msg = self.words[self.word_index % len(self.words)]
            self.word_index += 1
            return msg


# Global bot manager instance
_bot_manager = BotManager()


def get_bot_manager() -> BotManager:
    """Get the global bot manager"""
    return _bot_manager
