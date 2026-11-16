from flask import Blueprint, current_app, jsonify, request

from routes.errors import error_response
from schemas.query import QueryValidationError, parse_coordinates, parse_sky_image_query
from services.detectors import detector_catalog_for_date
from services.irsa_archive import ArchiveUnavailableError, search_images
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


@metadata_bp.get("/detectors")
def detector_metadata():
    try:
        query = parse_sky_image_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        catalog = detector_catalog_for_date(
            search_images(query.ra_deg, query.dec_deg), query.observation_date
        )
    except ArchiveUnavailableError:
        current_app.logger.exception("Detector metadata lookup failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    return jsonify(catalog)
