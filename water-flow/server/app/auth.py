from __future__ import annotations

import hmac
import logging
import os
from functools import wraps

from flask import jsonify, request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

logger = logging.getLogger(__name__)


def require_api_key(allowed_key_env: str):
    """Validate Bearer token against a specific env var."""

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify({"error": "missing or malformed Authorization header"}), 401
            token = auth[7:]
            expected = os.environ.get(allowed_key_env, "")
            if not expected or not hmac.compare_digest(token, expected):
                return jsonify({"error": "invalid API key"}), 401
            return f(*args, **kwargs)

        return wrapper

    return decorator


def require_oauth(f):
    """Validate Google ID token and check email against allowlist."""

    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing or malformed Authorization header"}), 401
        token = auth[7:]

        client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        if not client_id:
            logger.error("GOOGLE_CLIENT_ID not set")
            return jsonify({"error": "internal server error"}), 500

        try:
            idinfo = id_token.verify_oauth2_token(
                token, google_requests.Request(), client_id
            )
        except ValueError:
            return jsonify({"error": "invalid or expired token"}), 401

        email = idinfo.get("email", "").lower()
        allowed_raw = os.environ.get("ALLOWED_EMAILS", "")
        allowed = {e.strip().lower() for e in allowed_raw.split(",") if e.strip()}

        if len(allowed) > 10:
            logger.error("ALLOWED_EMAILS has more than 10 entries")
            return jsonify({"error": "internal server error"}), 500

        if email not in allowed:
            return jsonify({"error": "email not authorized"}), 403

        return f(*args, **kwargs)

    return wrapper
