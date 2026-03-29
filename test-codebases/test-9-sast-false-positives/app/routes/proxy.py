"""Proxy routes for the application."""

from flask import Blueprint, request, jsonify
import requests

bp = Blueprint("proxy", __name__)

INTERNAL_API_BASE = "http://internal-api.corp.example.com"


@bp.route("/api/user/<int:user_id>")
def get_user(user_id):
    resp = requests.get(f"{INTERNAL_API_BASE}/users/{user_id}", timeout=5)
    return jsonify(resp.json())


@bp.route("/fetch")
def fetch_url():
    url = request.args.get("url", "")
    resp = requests.get(url, timeout=10)
    return resp.text
