from flask import Blueprint, current_app, jsonify, request

from routes.errors import error_response
from schemas.query import QueryValidationError, parse_spectrum_query
from services.irsa_archive import ArchiveUnavailableError
from services.level2_spectrum import NoCoverageError, extract_spectrum

spectrum_bp = Blueprint("spectrum", __name__, url_prefix="/api/spectrum")


@spectrum_bp.get("")
def spectrum():
    try:
        query = parse_spectrum_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    try:
        payload = extract_spectrum(
            query.ra_deg, query.dec_deg, query.aperture_px, query.detectors
        )
    except NoCoverageError as exc:
        return error_response(404, "no_coverage", str(exc))
    except ArchiveUnavailableError:
        current_app.logger.exception("Spectrum archive lookup failed")
        return error_response(502, "image_source_unavailable", "The image archive is unavailable.")

    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp
