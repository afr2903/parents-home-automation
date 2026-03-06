from flask import Blueprint, jsonify

from app.db import get_uptime_stats, get_water_stats
from app.routes.sensor import TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM, _TZ_MOD

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/water")
def water_stats():
    return jsonify(get_water_stats(_TZ_MOD, TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM))


@stats_bp.route("/uptime")
def uptime_stats():
    return jsonify(get_uptime_stats())
