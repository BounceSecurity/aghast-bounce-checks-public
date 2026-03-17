from flask import Blueprint, request, jsonify
from auth import require_auth, check_query_length
from ai_service import send_ai_query

run_bp = Blueprint("run", __name__)


@run_bp.route("/api/v1/run", methods=["POST"])
@require_auth
def run_query():
    data = request.get_json()
    if not data or "query" not in data:
        return jsonify({"error": "Missing query field"}), 400

    query = data["query"]

    if not check_query_length(query):
        return jsonify({"error": "Query exceeds maximum length of 1000 characters"}), 400

    result = send_ai_query(query)
    return jsonify({"result": result}), 200
