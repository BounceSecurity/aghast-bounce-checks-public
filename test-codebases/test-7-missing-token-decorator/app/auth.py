from functools import wraps

from flask import request, jsonify, current_app


def require_api_token(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid authorization header"}), 401

        token = auth_header.split(" ", 1)[1]
        expected_token = current_app.config.get("API_TOKEN")
        if not expected_token or token != expected_token:
            return jsonify({"error": "Invalid API token"}), 403

        return f(*args, **kwargs)

    return decorated_function
