from datetime import date
from unittest.mock import Mock

import pytest

from schemas.metadata import CoordinateMetadata
from services.frames_service import ImageNotFoundError
from services.irsa_archive import ArchiveUnavailableError


COORDS = {"ra": "133.795", "dec": "-7.2455"}
QUERY = {**COORDS, "observationDate": "2025-05-01"}
ROUTES = [
    ("/api/metadata", "routes.metadata.get_coordinate_metadata"),
    ("/api/frames", "routes.frames.list_frames_for_date"),
    ("/api/frames/image", "routes.frames.get_sky_image_png"),
]


@pytest.mark.parametrize("endpoint,target", ROUTES)
@pytest.mark.parametrize("overrides", [
    {"ra": ""}, {"dec": " "}, {"ra": "garbage"}, {"dec": "garbage"},
    {"ra": "-1"}, {"ra": "360"}, {"dec": "-91"}, {"dec": "91"},
    {"ra": "nan"}, {"ra": "inf"}, {"dec": "-inf"},
])
def test_invalid_coordinates_do_not_call_service(client, monkeypatch, endpoint, target, overrides):
    service = Mock()
    monkeypatch.setattr(target, service)
    response = client.get(endpoint, query_string={**QUERY, **overrides})
    assert response.status_code == 400
    assert response.is_json
    assert response.json["error"]["code"] == "invalid_request"
    assert response.json["error"]["message"]
    service.assert_not_called()


@pytest.mark.parametrize("endpoint,target", ROUTES)
@pytest.mark.parametrize("missing", ["ra", "dec"])
def test_missing_coordinates(client, monkeypatch, endpoint, target, missing):
    service = Mock()
    monkeypatch.setattr(target, service)
    response = client.get(endpoint, query_string={k: v for k, v in QUERY.items() if k != missing})
    assert response.status_code == 400
    service.assert_not_called()


@pytest.mark.parametrize("endpoint,target", ROUTES[1:])
@pytest.mark.parametrize("overrides", [
    {"observationDate": ""}, {"observationDate": "2025-02-29"},
    {"observationDate": "2025-05-01T00:00:00"},
    {"fieldSizeDeg": "abc"}, {"fieldSizeDeg": "nan"},
    {"fieldSizeDeg": "inf"}, {"fieldSizeDeg": "0.009"}, {"fieldSizeDeg": "10.001"},
])
def test_invalid_image_query(client, monkeypatch, endpoint, target, overrides):
    service = Mock()
    monkeypatch.setattr(target, service)
    response = client.get(endpoint, query_string={**QUERY, **overrides})
    assert response.status_code == 400
    assert response.json["error"]["code"] == "invalid_request"
    service.assert_not_called()


@pytest.mark.parametrize("endpoint,target", ROUTES[1:])
def test_missing_observation_date(client, monkeypatch, endpoint, target):
    service = Mock()
    monkeypatch.setattr(target, service)
    assert client.get(endpoint, query_string=COORDS).status_code == 400
    service.assert_not_called()


def test_metadata_response_contract(client, monkeypatch):
    service = Mock(return_value=CoordinateMetadata(
        target_name="Orion", catalog_id="spherex_dr1", instrument="SPHEREx",
        available_bands=["D1", "D2"], available_dates=["2025-05-01"],
        frame_count=2, observation_window="2025-05-01",
    ))
    monkeypatch.setattr(ROUTES[0][1], service)
    response = client.get("/api/metadata", query_string=COORDS)
    assert response.status_code == 200
    assert response.is_json
    assert response.json == {
        "targetName": "Orion", "catalogId": "spherex_dr1", "instrument": "SPHEREx",
        "availableBands": ["D1", "D2"], "availableDates": ["2025-05-01"],
        "frameCount": 2, "observationWindow": "2025-05-01",
    }
    service.assert_called_once_with(133.795, -7.2455)


def test_frame_list_response_and_normalized_query(client, monkeypatch):
    frames = [{"id": "spherex-0", "timestamp": "02:00Z", "band": "IR",
               "filtered": False, "visible": True, "imageUrl": "/api/frames/image"}]
    service = Mock(return_value=frames)
    monkeypatch.setattr(ROUTES[1][1], service)
    response = client.get("/api/frames", query_string={
        **QUERY, "ra": "12 00 00", "dec": "-05 30 00", "fieldSizeDeg": "0.5deg",
    })
    assert response.status_code == 200
    assert response.is_json
    assert response.json == frames
    service.assert_called_once_with(pytest.approx(180.0), -5.5, date(2025, 5, 1), 0.5)


def test_empty_frame_list_is_success(client, monkeypatch):
    service = Mock(return_value=[])
    monkeypatch.setattr(ROUTES[1][1], service)
    response = client.get("/api/frames", query_string=QUERY)
    assert response.status_code == 200
    assert response.json == []
    service.assert_called_once_with(133.795, -7.2455, date(2025, 5, 1), 0.05)


@pytest.mark.parametrize("field_size", [None, "2"])
def test_image_response_and_cache_header(client, monkeypatch, field_size):
    service = Mock(return_value=b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(ROUTES[2][1], service)
    query = dict(QUERY)
    arguments = (133.795, -7.2455, date(2025, 5, 1))
    if field_size is not None:
        query["fieldSizeDeg"] = field_size
        arguments += (2.0,)
    response = client.get("/api/frames/image", query_string=query)
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert response.data == service.return_value
    assert response.headers["Cache-Control"] == "public, max-age=3600"
    service.assert_called_once_with(*arguments)


def test_image_not_found(client, monkeypatch):
    monkeypatch.setattr(ROUTES[2][1], Mock(side_effect=ImageNotFoundError("No image found.")))
    response = client.get("/api/frames/image", query_string=QUERY)
    assert response.status_code == 404
    assert response.json == {"error": {"code": "image_not_found", "message": "No image found."}}


@pytest.mark.parametrize("endpoint,target", ROUTES)
def test_archive_failures_do_not_leak_details(client, monkeypatch, endpoint, target):
    monkeypatch.setattr(target, Mock(side_effect=ArchiveUnavailableError("private upstream detail")))
    response = client.get(endpoint, query_string=QUERY)
    assert response.status_code == 502
    assert response.json == {"error": {"code": "image_source_unavailable",
                                       "message": "The image archive is unavailable."}}


@pytest.mark.parametrize("endpoint,target", ROUTES)
def test_get_routes_reject_post(client, monkeypatch, endpoint, target):
    service = Mock()
    monkeypatch.setattr(target, service)
    assert client.post(endpoint, json=QUERY).status_code == 405
    service.assert_not_called()


@pytest.mark.xfail(
    strict=True, raises=AssertionError,
    reason="Known bug: unexpected exceptions return Flask HTML instead of a JSON error",
)
@pytest.mark.parametrize("endpoint,target", ROUTES)
def test_unexpected_errors_return_safe_json(client, monkeypatch, endpoint, target):
    from app import app

    monkeypatch.setitem(app.config, "PROPAGATE_EXCEPTIONS", False)
    monkeypatch.setitem(app.config, "DEBUG", False)
    service = Mock(side_effect=RuntimeError("private upstream credentials"))
    monkeypatch.setattr(target, service)

    response = client.get(endpoint, query_string=QUERY)

    service.assert_called_once()
    assert response.status_code == 500
    assert "private upstream credentials" not in response.get_data(as_text=True)
    assert response.is_json, "Unexpected errors must use the API JSON error contract"
    error = response.json["error"]
    assert isinstance(error["code"], str) and error["code"]
    assert isinstance(error["message"], str) and error["message"]


@pytest.mark.xfail(
    strict=True, raises=AssertionError,
    reason="Known bug: date.fromisoformat also accepts compact and ISO week dates",
)
@pytest.mark.parametrize("endpoint,target", ROUTES[1:])
@pytest.mark.parametrize("value", ["20250501", "2025-W18-4"])
def test_only_calendar_dates_with_hyphens_are_accepted(client, monkeypatch, endpoint, target, value):
    service = Mock(return_value=[] if endpoint == "/api/frames" else b"PNG")
    monkeypatch.setattr(target, service)

    response = client.get(endpoint, query_string={**QUERY, "observationDate": value})

    assert response.status_code == 400, "Only YYYY-MM-DD dates are allowed"
    assert response.json["error"]["code"] == "invalid_request"
    service.assert_not_called()


@pytest.mark.xfail(
    strict=True, raises=AssertionError,
    reason="Known bug: all frames on a date link to the earliest image of that day",
)
def test_each_timeline_frame_downloads_its_own_image(client, monkeypatch):
    from astropy.table import Table
    from astropy.time import Time
    from services import frames_service

    start = Time("2025-05-01", scale="utc").mjd
    table = Table({"t_min": [start + 0.75, start], "access_url": ["late.fits", "early.fits"]})
    monkeypatch.setattr(frames_service, "search_images", Mock(return_value=table))
    # Keep routing, selection, and caching real; replace only image rendering.
    monkeypatch.setattr(frames_service, "_render_png", lambda source, *args: source.encode())

    listing = client.get("/api/frames", query_string=QUERY)
    assert listing.status_code == 200
    assert [frame["timestamp"] for frame in listing.json] == ["00:00Z", "18:00Z"]
    downloads = [client.get(frame["imageUrl"]) for frame in listing.json]
    assert all(response.status_code == 200 for response in downloads)
    assert [response.data for response in downloads] == [b"early.fits", b"late.fits"], (
        "Each timeline entry must resolve to its corresponding observation"
    )
