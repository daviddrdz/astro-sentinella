from flask import Blueprint, current_app, jsonify, request

from routes.errors import error_response
from schemas.query import QueryValidationError
from schemas.spectrum import parse_chunk_spectrum_query
from services.frames_service import ImageNotFoundError
from services.irsa_archive import ArchiveUnavailableError
from services.spectrum_service import SpectrumUnavailableError, chunk_spectrum

# Separate blueprint so clicks get their own (more generous) rate limit.
spectrum_bp = Blueprint("spectrum", __name__, url_prefix="/api/frames")


@spectrum_bp.get("/spectrum")
def frame_chunk_spectrum():
    try:
        query = parse_chunk_spectrum_query(request.args)
    except QueryValidationError as exc:
        return error_response(400, "invalid_request", str(exc))

    sky = query.sky
    try:
        payload = chunk_spectrum(
            sky.ra_deg, sky.dec_deg, sky.observation_date, sky.field_size_deg, query.x, query.y
        )
    except ImageNotFoundError as exc:
        return error_response(404, "image_not_found", str(exc))
    except SpectrumUnavailableError as exc:
        return error_response(404, "spectrum_unavailable", str(exc))
    except ArchiveUnavailableError:
        current_app.logger.exception("Chunk spectrum lookup failed")
        return error_response(502, "spectrum_source_unavailable", "The spectral archive is unavailable.")

    resp = jsonify(payload)
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp
