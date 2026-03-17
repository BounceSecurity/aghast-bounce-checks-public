from flask import Blueprint, jsonify, request

bp = Blueprint("test", __name__)


def require_api_token(f):
    return f


# ruleid: aghast-py-missing-token-decorator
@bp.route("/unprotected", methods=["GET"])
def unprotected_get():
    return jsonify({"data": []})


# ruleid: aghast-py-missing-token-decorator
@bp.route("/unprotected", methods=["POST"])
def unprotected_post():
    return jsonify({"created": True})


# ruleid: aghast-py-missing-token-decorator
@bp.route("/items/<int:item_id>", methods=["DELETE"])
def unprotected_delete(item_id):
    return jsonify({"deleted": item_id})


# ok: aghast-py-missing-token-decorator
@bp.route("/protected", methods=["GET"])
@require_api_token
def protected_get():
    return jsonify({"data": []})


# ok: aghast-py-missing-token-decorator
@bp.route("/protected", methods=["POST"])
@require_api_token
def protected_post():
    return jsonify({"created": True})


# ok: aghast-py-missing-token-decorator
@require_api_token
@bp.route("/also-protected", methods=["PUT"])
def also_protected_put():
    return jsonify({"updated": True})


# ok: aghast-py-missing-token-decorator
@bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})


# ok: aghast-py-missing-token-decorator
@bp.route("/ready", methods=["GET"])
def readiness_check():
    return jsonify({"status": "ready"})


# ok: aghast-py-missing-token-decorator
@bp.route("/liveness", methods=["GET"])
def liveness_check():
    return jsonify({"status": "alive"})


# ok: aghast-py-missing-token-decorator
@bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"pong": True})
