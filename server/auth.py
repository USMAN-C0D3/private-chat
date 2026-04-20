from __future__ import annotations

from functools import wraps
from typing import Any, Callable, ParamSpec, TypeVar

from flask import current_app, jsonify, redirect, session, url_for
from werkzeug.security import check_password_hash

from .accounts import PrivateAccount, normalize_username
from .security import ensure_csrf_token


P = ParamSpec("P")
R = TypeVar("R")


def _private_accounts() -> dict[str, PrivateAccount]:
    return current_app.config["PRIVATE_ACCOUNTS"]


def primary_account_username() -> str:
    return next(iter(_private_accounts()))


def current_user() -> str | None:
    username = session.get("username")
    if not isinstance(username, str):
        return None

    normalized = normalize_username(username)
    if normalized in _private_accounts():
        return normalized

    return None


def is_valid_credentials(username: str, password: str) -> bool:
    normalized = normalize_username(username)
    account = _private_accounts().get(normalized)
    if account is None:
        return False

    return check_password_hash(account.password_hash, password)


def display_name_for(username: str | None) -> str | None:
    if username is None:
        return None

    normalized = normalize_username(username)
    account = _private_accounts().get(normalized)
    if account is None:
        return None

    return account.display_name


def partner_for(username: str) -> str | None:
    normalized = normalize_username(username)
    for candidate in _private_accounts():
        if candidate != normalized:
            return candidate

    return None


def partner_display_name_for(username: str) -> str | None:
    return display_name_for(partner_for(username))


def login_user(username: str) -> None:
    session.clear()
    session["username"] = normalize_username(username)
    session.permanent = True


def logout_user() -> None:
    session.clear()


def build_public_auth_payload() -> dict[str, Any]:
    return {
        "authenticated": False,
        "csrfToken": ensure_csrf_token(),
    }


def build_session_payload(username: str) -> dict[str, Any]:
    partner = partner_for(username)
    return {
        "authenticated": True,
        "user": username,
        "userDisplayName": display_name_for(username),
        "partner": partner,
        "partnerDisplayName": display_name_for(partner),
        "csrfToken": ensure_csrf_token(),
    }


def page_login_required(view: Callable[P, R]) -> Callable[P, R]:
    @wraps(view)
    def wrapped(*args: P.args, **kwargs: P.kwargs):  # type: ignore[misc]
        if not current_user():
            return redirect(url_for("web.auth_page"))
        return view(*args, **kwargs)

    return wrapped


def api_login_required(view: Callable[P, R]) -> Callable[P, R]:
    @wraps(view)
    def wrapped(*args: P.args, **kwargs: P.kwargs):  # type: ignore[misc]
        if not current_user():
            return jsonify({"authenticated": False, "message": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped
