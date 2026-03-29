from flask import Flask


def create_app():
    app = Flask(__name__)

    from app.routes import search, redirect_handler, proxy
    app.register_blueprint(search.bp)
    app.register_blueprint(redirect_handler.bp)
    app.register_blueprint(proxy.bp)

    return app
