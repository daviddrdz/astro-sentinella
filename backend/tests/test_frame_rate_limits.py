from unittest.mock import Mock

import pytest

from app import app


QUERY = {"ra": "133.795", "dec": "-7.2455", "observationDate": "2025-05-01"}


@pytest.fixture(autouse=True)
def limits(monkeypatch):
    monkeypatch.setitem(app.config, "METADATA_RATE_LIMIT", "2 per minute")
    monkeypatch.setitem(app.config, "FRAME_IMAGE_RATE_LIMIT", "1 per minute")
    monkeypatch.setattr("routes.frames.get_sky_image_png", Mock(return_value=b"PNG"))
    monkeypatch.setattr("routes.frames.list_frames_for_date", Mock(return_value=[]))


@pytest.mark.parametrize("endpoint", ["/api/frames", "/api/frames/image"])
def test_frame_routes_enforce_limit_and_retry_header(client, endpoint):
    assert client.get(endpoint, query_string=QUERY).status_code == 200
    response = client.get(endpoint, query_string=QUERY)
    assert response.status_code == 429
    assert response.json == {"error": {"code": "rate_limited",
                                       "message": "Too many requests. Try again later."}}
    assert int(response.headers["Retry-After"]) > 0


def test_invalid_metadata_requests_count_toward_limit(client):
    for status in [400, 400, 429]:
        assert client.get("/api/metadata", query_string={"ra": "1", "dec": "95"}).status_code == status


def test_route_limits_are_independent(client):
    assert client.get("/api/frames/image", query_string=QUERY).status_code == 200
    assert client.get("/api/frames/image", query_string=QUERY).status_code == 429
    assert client.get("/api/frames", query_string=QUERY).status_code == 200
    assert client.get("/api/metadata", query_string={"ra": "1", "dec": "95"}).status_code == 400


def test_limits_are_per_client_address(client):
    for address, status in [("10.0.0.1", 200), ("10.0.0.1", 429), ("10.0.0.2", 200)]:
        response = client.get("/api/frames/image", query_string=QUERY,
                              environ_base={"REMOTE_ADDR": address})
        assert response.status_code == status


def test_forwarded_headers_cannot_bypass_limit(client):
    assert client.get("/api/frames/image", query_string=QUERY).status_code == 200
    response = client.get("/api/frames/image", query_string=QUERY,
                          headers={"X-Forwarded-For": "203.0.113.9"})
    assert response.status_code == 429
