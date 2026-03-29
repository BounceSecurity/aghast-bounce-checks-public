"""Redirect routes for the application."""

from flask import Blueprint, request, redirect, abort

bp = Blueprint("redirect_handler", __name__)

ALLOWED_REDIRECT_HOSTS = [
    "example.com",
    "docs.example.com",
    "app.example.com",
]


@bp.route("/goto")
def safe_redirect():
    url = request.args.get("url", "")
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_REDIRECT_HOSTS:
        abort(400, "Redirect target not allowed")
    return redirect(url)


@bp.route("/out")
def open_redirect():
    target = request.args.get("target", "/")
    return redirect(target)
