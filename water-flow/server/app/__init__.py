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
        default_limits=["200/minute"],
        storage_uri="memory://",
    )
    # Per-blueprint limits. pump_bp and sensor_bp serve both ESP32 devices
    # AND the dashboard, so limits must accommodate dashboard polling (~12/min).
    limiter.limit("60/minute")(sensor_bp)
    limiter.limit("60/minute")(pump_bp)
    limiter.limit("60/minute")(stats_bp)

    app.register_blueprint(pump_bp,   url_prefix="/api/pump")
    app.register_blueprint(sensor_bp, url_prefix="/api/sensor")
    app.register_blueprint(stats_bp,  url_prefix="/api/stats")

    @app.route("/health")
    def health():
        return {"status": "ok"}, 200

    # Ensure 429 responses include CORS headers so the browser doesn't
    # misreport the rate limit error as a CORS error.
    from flask import jsonify as _jsonify, request as _request

    @app.errorhandler(429)
    def ratelimit_handler(e):
        origin = _request.headers.get("Origin", "")
        resp = _jsonify({"error": "rate limit exceeded"})
        resp.status_code = 429
        if origin and (origins == ["*"] or origin in origins):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        return resp

    return app
