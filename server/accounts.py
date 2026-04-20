from __future__ import annotations

import os
from dataclasses import dataclass

from werkzeug.security import generate_password_hash


def normalize_username(value: str) -> str:
    return value.strip().lower()


@dataclass(slots=True, frozen=True)
class PrivateAccount:
    username: str
    display_name: str
    password_hash: str


def _getenv(name: str, default: str) -> str:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    value = raw_value.strip()
    return value or default


def _load_account(index: int) -> tuple[PrivateAccount, bool]:
    username_env = f"PRIVATE_ACCOUNT_{index}_USERNAME"
    display_env = f"PRIVATE_ACCOUNT_{index}_DISPLAY_NAME"
    password_env = f"PRIVATE_ACCOUNT_{index}_PASSWORD"
    password_hash_env = f"PRIVATE_ACCOUNT_{index}_PASSWORD_HASH"

    default_username = "usman" if index == 1 else "aisha"
    default_display_name = "Usman" if index == 1 else "Aisha"
    default_password = "usman07" if index == 1 else "aisha123"

    username = normalize_username(_getenv(username_env, default_username))
    if not username:
        raise RuntimeError(f"{username_env} must not be empty.")

    display_name = _getenv(display_env, default_display_name)
    if not display_name:
        raise RuntimeError(f"{display_env} must not be empty.")

    password_hash = os.getenv(password_hash_env, "").strip()
    if password_hash:
        return (
            PrivateAccount(
                username=username,
                display_name=display_name,
                password_hash=password_hash,
            ),
            False,
        )

    password = _getenv(password_env, default_password)
    return (
        PrivateAccount(
            username=username,
            display_name=display_name,
            password_hash=generate_password_hash(password),
        ),
        password == default_password,
    )


def load_private_accounts(app_env: str) -> dict[str, PrivateAccount]:
    loaded_accounts = [_load_account(1), _load_account(2)]
    usernames = [account.username for account, _ in loaded_accounts]
    if len(set(usernames)) != len(usernames):
        raise RuntimeError("Private account usernames must be unique.")

    if app_env == "production" and any(using_default_password for _, using_default_password in loaded_accounts):
        raise RuntimeError(
            "Set PRIVATE_ACCOUNT_1_PASSWORD and PRIVATE_ACCOUNT_2_PASSWORD or provide password hashes before deploying."
        )

    return {account.username: account for account, _ in loaded_accounts}
