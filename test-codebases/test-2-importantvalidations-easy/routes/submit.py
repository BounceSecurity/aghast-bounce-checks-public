from flask import Blueprint, request, jsonify
from auth import require_auth, check_manager_role, check_query_length, is_business_hours
from ai_service import send_ai_query, checkForMaliciousPrompt

submit_bp = Blueprint("submit", __name__)


@submit_bp.route("/api/v1/submit", methods=["POST"])
@require_auth
def submit_query():
    data = request.get_json()
    if not data or "query" not in data:
        return jsonify({"error": "Missing query field"}), 400

    query = data["query"]
    payload = request.jwt_payload

    if not check_manager_role(payload):
        return jsonify({"error": "Insufficient role. Manager role required."}), 403

    if not check_query_length(query):
        return jsonify({"error": "Query exceeds maximum length of 1000 characters"}), 400

    if not is_business_hours():
        return jsonify({"error": "Queries are only allowed during business hours (9:00-17:00, Mon-Fri)"}), 403

    if not checkForMaliciousPrompt(query):
        return jsonify({"error": "Query flagged as potentially malicious"}), 400

    result = send_ai_query(query)
    return jsonify({"result": result}), 200
