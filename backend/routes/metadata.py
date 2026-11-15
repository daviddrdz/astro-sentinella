from flask import Blueprint, current_app, jsonify, request

from routes.errors import error_response
from schemas.query import QueryValidationError, parse_coordinates
from services.irsa_archive import ArchiveUnavailableError
from services.metadata_service import get_coordinate_metadata

metadata_bp = Blueprint("metadata", __name__, url_prefix="/api/metadata")


@metadata_bp.get("")
def coordinate_metadata():
    try:
        coords = parse_coordinates(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        metadata = get_coordinate_metadata(coords.ra_deg, coords.dec_deg)
    except ArchiveUnavailableError:
        current_app.logger.exception("Coordinate metadata lookup failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    return jsonify(metadata.to_json())
