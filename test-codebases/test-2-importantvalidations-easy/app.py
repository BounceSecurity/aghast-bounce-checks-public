from flask import Flask
from routes.submit import submit_bp
from routes.run import run_bp
from routes.execute import execute_bp

app = Flask(__name__)

app.register_blueprint(submit_bp)
app.register_blueprint(run_bp)
app.register_blueprint(execute_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
