from flask import Flask
from routes.processing import processing_bp
from routes.analysis import analysis_bp
from routes.execution import execution_bp

app = Flask(__name__)

app.register_blueprint(processing_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(execution_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
