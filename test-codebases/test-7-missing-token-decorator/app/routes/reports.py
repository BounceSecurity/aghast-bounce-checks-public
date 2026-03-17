from flask import Blueprint, jsonify, request, send_file

from app.auth import require_api_token
from app.models import db

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/summary", methods=["GET"])
@require_api_token
def get_summary_report():
    start_date = request.args.get("start")
    end_date = request.args.get("end")
    summary = db.get_task_summary(start_date, end_date)
    return jsonify(summary)


@reports_bp.route("/export", methods=["POST"])
def export_report():
    data = request.get_json()
    format_type = data.get("format", "csv")
    report_path = db.generate_report(format_type)
    return send_file(report_path, as_attachment=True)


@reports_bp.route("/scheduled", methods=["GET"])
@require_api_token
def list_scheduled_reports():
    reports = db.get_scheduled_reports()
    return jsonify({"reports": reports})


@reports_bp.route("/scheduled", methods=["POST"])
@require_api_token
def create_scheduled_report():
    data = request.get_json()
    report = db.create_scheduled_report(data)
    return jsonify(report), 201
