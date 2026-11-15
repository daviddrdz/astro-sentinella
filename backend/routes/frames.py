from flask import Blueprint, Response, current_app, request

from routes.errors import error_response
from schemas.query import QueryValidationError, parse_sky_image_query
from services.frames_service import ImageNotFoundError, get_sky_image_png
from services.irsa_archive import ArchiveUnavailableError

frames_bp = Blueprint("frames", __name__, url_prefix="/api/frames")


@frames_bp.get("/image")
def frame_image():
    try:
        query = parse_sky_image_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        png = get_sky_image_png(query.ra_deg, query.dec_deg, query.observation_date)
    except ImageNotFoundError as exc:
        return error_response(404, "image_not_found", str(exc))
    except ArchiveUnavailableError:
        current_app.logger.exception("Sky image retrieval failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    return Response(png, mimetype="image/png")
