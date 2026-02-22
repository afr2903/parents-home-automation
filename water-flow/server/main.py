from flask import Flask

from routes.pump import pump_bp
from routes.sensor import sensor_bp

app = Flask(__name__)

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

app.register_blueprint(pump_bp,   url_prefix="/api/pump")
app.register_blueprint(sensor_bp, url_prefix="/api/sensor")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001)
