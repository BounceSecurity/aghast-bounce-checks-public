# ruleid: aghast-importantvalidations-mc
@analysis_bp.route("/api/v1/analyze", methods=["POST"])
@require_auth
def analyze_query():
    data = request.get_json()
    if not data or "query" not in data:
        return jsonify({"error": "Missing query field"}), 400

    query = data["query"]

    if not check_query_length(query):
        return jsonify({"error": "Query exceeds maximum length of 1000 characters"}), 400

    if not checkForMaliciousPrompt(query):
        return jsonify({"error": "Query flagged as potentially malicious"}), 400

    result = send_ai_query(query)
    return jsonify({"result": result}), 200

# ok: aghast-importantvalidations-mc
@analysis_bp.route("/api/v1/analyze", methods=["POST"])
@require_auth
def analyze_query():
    data = request.get_json()
    if not data or "query" not in data:
        return jsonify({"error": "Missing query field"}), 400

    query = data["query"]

    if not check_query_length(query):
        return jsonify({"error": "Query exceeds maximum length of 1000 characters"}), 400

    if not checkForMaliciousPrompt(query):
        return jsonify({"error": "Query flagged as potentially malicious"}), 400

    result = somethingelse(query)
    return jsonify({"result": result}), 200
