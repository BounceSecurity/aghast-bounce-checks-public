from flask import Blueprint, jsonify, request

from app.auth import require_api_token
from app.models import db

users_bp = Blueprint("users", __name__)


@users_bp.route("/", methods=["GET"])
@require_api_token
def list_users():
    users = db.get_users()
    return jsonify({"users": users})


@users_bp.route("/<int:user_id>", methods=["GET"])
@require_api_token
def get_user(user_id):
    user = db.get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user)


@users_bp.route("/", methods=["POST"])
@require_api_token
def create_user():
    data = request.get_json()
    if not data or "email" not in data:
        return jsonify({"error": "Email is required"}), 400
    user = db.create_user(data)
    return jsonify(user), 201


@users_bp.route("/<int:user_id>/tasks", methods=["GET"])
def get_user_tasks(user_id):
    tasks = db.get_tasks_for_user(user_id)
    return jsonify({"tasks": tasks})
