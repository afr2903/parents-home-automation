from flask import Flask

from app.routes.pump import pump_bp
from app.routes.sensor import sensor_bp
from app.routes.stats import stats_bp


def create_app() -> Flask:
    app = Flask(__name__)

    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"]  = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    app.register_blueprint(pump_bp,   url_prefix="/api/pump")
    app.register_blueprint(sensor_bp, url_prefix="/api/sensor")
    app.register_blueprint(stats_bp,  url_prefix="/api/stats")

    return app
