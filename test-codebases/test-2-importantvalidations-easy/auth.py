import os
import jwt
from flask import request, jsonify
from functools import wraps
from datetime import datetime

JWT_PUBLIC_KEY = os.environ.get("AIQUERYRUN_JWT_PUBLIC_KEY", "")


def decode_jwt(token):
    return jwt.decode(token, JWT_PUBLIC_KEY, algorithms=["RS256"])


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header.split(" ")[1]
        try:
            payload = decode_jwt(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        request.jwt_payload = payload
        return f(*args, **kwargs)
    return decorated


def check_manager_role(payload):
    return payload.get("role") == "manager"


def check_query_length(query):
    return len(query) < 1000


def is_business_hours():
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    if now.hour < 9 or now.hour >= 17:
        return False
    return True
