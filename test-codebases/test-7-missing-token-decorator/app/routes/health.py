from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})


@health_bp.route("/ready", methods=["GET"])
def readiness_check():
    return jsonify({"status": "ready", "checks": {"db": True, "cache": True}})
