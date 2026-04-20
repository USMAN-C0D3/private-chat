from __future__ import annotations

import json
from pathlib import Path

from flask import Blueprint, Flask, current_app, jsonify, request, send_from_directory

from .auth import (
    api_login_required,
    build_public_auth_payload,
    build_session_payload,
    current_user,
    display_name_for,
    is_valid_credentials,
    login_user,
    logout_user,
    page_login_required,
    partner_display_name_for,
    partner_for,
    primary_account_username,
)
from .security import client_ip, validate_csrf_token
from .services import get_chat_services


api_bp = Blueprint("api", __name__, url_prefix="/api")
web_bp = Blueprint("web", __name__)


@api_bp.get("/health")
def healthcheck():
    return jsonify({"status": "ok"})


@api_bp.get("/ready")
def readiness_check():
    try:
        stats = get_chat_services().store.stats()
        return jsonify(
            {
                "status": "ok",
                "database": "ok",
                "storedMessages": stats["stored"],
            }
        )
    except Exception:
        current_app.logger.exception("Readiness check failed")
        return jsonify({"status": "error", "database": "unavailable"}), 503


@web_bp.get("/health")
def web_healthcheck():
    return jsonify({"status": "ok"})


@api_bp.get("/auth/session")
def auth_session():
    username = current_user()
    if not username:
        return jsonify(build_public_auth_payload())

    return jsonify(build_session_payload(username))


@api_bp.post("/auth/login")
def auth_login():
    if not validate_csrf_token():
        return jsonify({"message": "Your session expired. Refresh and try again.", **build_public_auth_payload()}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        if request.form:
            payload = request.form.to_dict()
        else:
            raw = request.get_data(cache=False, as_text=True).strip()
            if raw:
                try:
                    candidate = json.loads(raw)
                    payload = candidate if isinstance(candidate, dict) else {}
                except json.JSONDecodeError:
                    payload = {}
            else:
                payload = {}

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()
    limiter_key = f"{client_ip()}::{username.strip().lower() or 'anonymous'}"
    rate_limiter = current_app.extensions["login_rate_limiter"]
    allowed, retry_after = rate_limiter.check(limiter_key)
    if not allowed:
        return (
            jsonify(
                {
                    "message": "Too many login attempts. Please wait a moment and try again.",
                    "retryAfterSeconds": retry_after,
                    **build_public_auth_payload(),
                }
            ),
            429,
        )

    if not is_valid_credentials(username, password):
        rate_limiter.record_failure(limiter_key)
        return jsonify({"message": "Invalid username or password.", **build_public_auth_payload()}), 401

    rate_limiter.reset(limiter_key)
    login_user(username)
    active_user = current_user()
    if active_user is None:
        return jsonify({"message": "Unable to restore the session."}), 500

    return jsonify(build_session_payload(active_user))


@api_bp.post("/auth/logout")
def auth_logout():
    if not validate_csrf_token():
        return jsonify({"message": "Your session expired. Refresh and try again.", **build_public_auth_payload()}), 400

    logout_user()
    return ("", 204)


@api_bp.get("/inbox")
@api_login_required
def inbox_data():
    username = current_user()
    if username is None:
        return jsonify({"message": "Authentication required."}), 401

    services = get_chat_services()
    partner = partner_for(username)

    return jsonify(
        {
            "thread": {
                "id": "private-thread",
                "title": display_name_for(partner) or "Private chat",
                "username": partner,
                "lastMessage": services.store.latest(),
            }
        }
    )


@api_bp.get("/chat/bootstrap")
@api_login_required
def chat_bootstrap():
    username = current_user()
    if username is None:
        return jsonify({"message": "Authentication required."}), 401

    services = get_chat_services()
    page_size = _page_size()
    messages, has_more, next_cursor = services.store.recent_page(page_size)
    partner = partner_for(username)

    return jsonify(
        {
            "messages": messages,
            "hasMore": has_more,
            "nextCursor": next_cursor,
            "viewer": username,
            "viewerDisplayName": display_name_for(username),
            "partner": partner,
            "partnerDisplayName": partner_display_name_for(username),
            "viewerLastReadId": services.read_receipts.last_read_for(username),
            "partnerLastReadId": services.read_receipts.last_read_for(partner),
        }
    )


@api_bp.get("/chat/history")
@api_login_required
def chat_history():
    before_raw = request.args.get("before", "").strip()
    if not before_raw:
        return jsonify({"message": "The 'before' cursor is required."}), 400

    try:
        before_id = int(before_raw)
    except ValueError:
        return jsonify({"message": "The 'before' cursor must be an integer."}), 400

    services = get_chat_services()
    page_size = _page_size()
    messages, has_more, next_cursor = services.store.before_page(before_id, page_size)

    return jsonify(
        {
            "messages": messages,
            "hasMore": has_more,
            "nextCursor": next_cursor,
        }
    )


@api_bp.get("/bot/wordlist")
@api_login_required
def bot_wordlist_metadata():
    username = _authorized_bot_user()
    if username is None:
        return jsonify({"message": "Only the primary private account can control the bot."}), 403

    services = get_chat_services()
    return jsonify(services.bot_wordlists.metadata(username))


@api_bp.post("/bot/wordlist")
@api_login_required
def bot_wordlist_upload():
    if not validate_csrf_token():
        return jsonify({"message": "Your session expired. Refresh and try again.", **build_public_auth_payload()}), 400

    username = _authorized_bot_user()
    if username is None:
        return jsonify({"message": "Only the primary private account can control the bot."}), 403

    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"message": "Choose a .txt wordlist to upload."}), 400

    filename = Path(upload.filename).name
    if Path(filename).suffix.lower() != ".txt":
        return jsonify({"message": "Only .txt wordlists are supported."}), 400

    raw_bytes = upload.read()
    max_bytes = current_app.config["BOT_WORDLIST_MAX_UPLOAD_BYTES"]
    if len(raw_bytes) > max_bytes:
        return jsonify({"message": f"Wordlist files are limited to {max_bytes // 1_000_000} MB."}), 413

    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        return jsonify({"message": "Wordlist files must be UTF-8 text."}), 400

    try:
        words = _normalize_wordlist_lines(text)
    except ValueError as caught_error:
        return jsonify({"message": str(caught_error)}), 400

    services = get_chat_services()
    return jsonify(services.bot_wordlists.save(username, filename, words))


@api_bp.delete("/bot/wordlist")
@api_login_required
def bot_wordlist_delete():
    if not validate_csrf_token():
        return jsonify({"message": "Your session expired. Refresh and try again.", **build_public_auth_payload()}), 400

    username = _authorized_bot_user()
    if username is None:
        return jsonify({"message": "Only the primary private account can control the bot."}), 403

    services = get_chat_services()
    services.bot_wordlists.clear(username)
    return ("", 204)


@web_bp.get("/")
def auth_page():
    return _serve_spa_shell()


@web_bp.get("/login")
def login_page():
    return _serve_spa_shell()


@web_bp.get("/chat")
@page_login_required
def chat_page():
    return _serve_spa_shell()


@web_bp.get("/inbox")
@page_login_required
def inbox_page():
    return _serve_spa_shell()


@web_bp.get("/assets/<path:filename>")
def frontend_assets(filename: str):
    assets_dir = current_app.config["FRONTEND_ASSETS_DIR"]
    return send_from_directory(assets_dir, filename, conditional=True, max_age=31_536_000)


@web_bp.get("/<path:filename>")
def static_dist_files(filename: str):
    dist_dir = Path(current_app.config["FRONTEND_DIST_DIR"])
    file_path = dist_dir / filename

    if file_path.is_file():
        return send_from_directory(dist_dir, filename, conditional=True)

    return _serve_spa_shell()


def register_routes(app: Flask) -> None:
    app.register_blueprint(api_bp)
    app.register_blueprint(web_bp)


def _page_size() -> int:
    default_limit = current_app.config["CHAT_HISTORY_PAGE_SIZE"]
    max_limit = current_app.config["CHAT_HISTORY_MAX_PAGE_SIZE"]
    raw_limit = request.args.get("limit")

    if raw_limit is None:
        return default_limit

    try:
        parsed_limit = int(raw_limit)
    except ValueError:
        return default_limit

    return max(1, min(parsed_limit, max_limit))


def _authorized_bot_user() -> str | None:
    username = current_user()
    if username != primary_account_username():
        return None

    return username


def _normalize_wordlist_lines(text: str) -> list[str]:
    max_lines = current_app.config["BOT_WORDLIST_MAX_LINES"]
    max_length = current_app.config["MAX_MESSAGE_LENGTH"]

    words: list[str] = []
    for raw_line in text.splitlines():
        normalized = raw_line.strip()
        if not normalized:
            continue

        words.append(normalized[:max_length])
        if len(words) > max_lines:
            raise ValueError(f"Wordlists are limited to {max_lines:,} lines.")

    if not words:
        raise ValueError("Please upload a wordlist with at least one non-empty line.")

    return words


def _serve_spa_shell():
    dist_dir = Path(current_app.config["FRONTEND_DIST_DIR"])
    index_file = dist_dir / "index.html"

    if not index_file.exists():
        return (
            "Frontend build not found. Run `npm run build` so Flask can serve the SPA shell.",
            503,
            {"Content-Type": "text/plain; charset=utf-8"},
        )

    return send_from_directory(dist_dir, "index.html", max_age=0)
