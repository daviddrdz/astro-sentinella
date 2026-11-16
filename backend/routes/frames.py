from flask import Blueprint, Response, current_app, jsonify, request

from routes.errors import error_response
from schemas.query import QueryValidationError, parse_sky_image_query
from services.frames_service import (
    ImageNotFoundError,
    get_sky_image_png,
    list_frames_for_date,
)
from services.irsa_archive import ArchiveUnavailableError
from services.spectrum_service import prefetch_field_cube

frames_bp = Blueprint("frames", __name__, url_prefix="/api/frames")


@frames_bp.get("")
def list_frames():
    try:
        query = parse_sky_image_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        frames = list_frames_for_date(
            query.ra_deg,
            query.dec_deg,
            query.observation_date,
            query.field_size_deg,
        )
    except ArchiveUnavailableError:
        current_app.logger.exception("Frame list lookup failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    return jsonify(frames)


@frames_bp.get("/image")
def frame_image():
    try:
        query = parse_sky_image_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        options = {}
        if "fieldSizeDeg" in request.args:
            options["size_deg"] = query.field_size_deg
        if "color" in request.args:
            options["color"] = query.color
        if "bands" in request.args:
            options["bands"] = query.bands or None
        if query.detectors:
            options["detectors"] = query.detectors
        png_bytes = get_sky_image_png(
            query.ra_deg, query.dec_deg, query.observation_date, **options
        )
    except ImageNotFoundError as exc:
        return error_response(404, "image_not_found", str(exc))
    except ArchiveUnavailableError:
        current_app.logger.exception("Frame image lookup failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    # The user is likely to click this frame next; warm its spectral cube now.
    prefetch_field_cube(query.ra_deg, query.dec_deg, query.field_size_deg)

    resp = Response(png_bytes, mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp
