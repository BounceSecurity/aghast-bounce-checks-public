"""Search routes for the application."""

from flask import Blueprint, request, render_template, make_response
from markupsafe import Markup

bp = Blueprint("search", __name__)


@bp.route("/search")
def search_results():
    query = request.args.get("q", "")
    return render_template("search_results.html", query=query)


@bp.route("/help")
def help_page():
    banner = Markup("<strong>Welcome to the help page</strong>")
    return render_template("help.html", banner=banner)


@bp.route("/echo")
def echo():
    user_input = request.args.get("msg", "")
    response = make_response(f"<p>You said: {user_input}</p>")
    response.headers["Content-Type"] = "text/html"
    return response
