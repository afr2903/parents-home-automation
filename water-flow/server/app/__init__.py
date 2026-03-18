import os

from flask import Flask
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from app.routes.pump import pump_bp
from app.routes.sensor import sensor_bp
from app.routes.stats import stats_bp


def create_app() -> Flask:
    app = Flask(__name__)

    # CORS
    origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    CORS(app, origins=origins)

    # Rate limiting
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["100/minute"],
        storage_uri="memory://",
    )
    limiter.limit("5/minute")(sensor_bp)
    limiter.limit("10/minute")(pump_bp)
    limiter.limit("30/minute")(stats_bp)

    app.register_blueprint(pump_bp,   url_prefix="/api/pump")
    app.register_blueprint(sensor_bp, url_prefix="/api/sensor")
    app.register_blueprint(stats_bp,  url_prefix="/api/stats")

    @app.route("/health")
    def health():
        return {"status": "ok"}, 200

    return app
