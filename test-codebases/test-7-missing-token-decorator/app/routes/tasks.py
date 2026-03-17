from flask import Blueprint, jsonify, request

from app.auth import require_api_token
from app.models import db

tasks_bp = Blueprint("tasks", __name__)


@tasks_bp.route("/", methods=["GET"])
@require_api_token
def list_tasks():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    tasks = db.get_tasks(page=page, per_page=per_page)
    return jsonify({"tasks": tasks, "page": page})


@tasks_bp.route("/<int:task_id>", methods=["GET"])
@require_api_token
def get_task(task_id):
    task = db.get_task(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)


@tasks_bp.route("/", methods=["POST"])
@require_api_token
def create_task():
    data = request.get_json()
    if not data or "title" not in data:
        return jsonify({"error": "Title is required"}), 400
    task = db.create_task(data)
    return jsonify(task), 201


@tasks_bp.route("/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json()
    task = db.update_task(task_id, data)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)


@tasks_bp.route("/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    success = db.delete_task(task_id)
    if not success:
        return jsonify({"error": "Task not found"}), 404
    return jsonify({"message": "Task deleted"}), 200
