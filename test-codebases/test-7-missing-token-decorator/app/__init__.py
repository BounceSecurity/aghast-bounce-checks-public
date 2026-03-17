from flask import Flask


def create_app():
    app = Flask(__name__)
    app.config.from_prefixed_env()

    from app.routes.tasks import tasks_bp
    from app.routes.users import users_bp
    from app.routes.health import health_bp
    from app.routes.reports import reports_bp

    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(users_bp, url_prefix="/api/users")
    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")

    return app
