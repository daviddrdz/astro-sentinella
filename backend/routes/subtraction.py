import base64

from flask import Blueprint, current_app, jsonify, request

from routes.errors import error_response
from schemas.subtraction import SubtractionValidationError, parse_subtraction_query
from services.frames_service import ImageNotFoundError
from services.irsa_archive import ArchiveUnavailableError
from services.subtraction_service import subtract_observations

subtraction_bp = Blueprint("subtraction", __name__, url_prefix="/api/subtract")


@subtraction_bp.post("")
def subtract_endpoint():
    if not request.is_json:
        return error_response(400, "invalid_request", "A JSON request body is required.")
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response(400, "invalid_request", "A JSON object is required.")

    try:
        query = parse_subtraction_query(body)
    except SubtractionValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        png_bytes, summary = subtract_observations(
            query.ra_deg,
            query.dec_deg,
            query.observation_date_a,
            query.observation_date_b,
            query.detector,
            query.size,
            query.options,
        )
    except ImageNotFoundError as exc:
        return error_response(404, "image_not_found", str(exc))
    except ArchiveUnavailableError:
        current_app.logger.exception("Subtraction image source failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")
    except ValueError as exc:
        return error_response(422, "subtraction_failed", str(exc))
    except Exception:
        current_app.logger.exception("Image subtraction failed")
        return error_response(500, "internal_error", "The images could not be subtracted.")

    response = jsonify(
        imageDataUrl=f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}",
        summary=summary,
    )
    response.headers["Cache-Control"] = "no-store"
    return response
