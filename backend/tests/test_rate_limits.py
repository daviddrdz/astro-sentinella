import pytest

from app import app

METADATA_ARGS = {"ra": "133.795", "dec": "-7.2455"}
IMAGE_ARGS = {**METADATA_ARGS, "observationDate": "2025-05-01"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setitem(app.config, "METADATA_RATE_LIMIT", "2 per minute")
    monkeypatch.setitem(app.config, "FRAME_IMAGE_RATE_LIMIT", "1 per minute")
    monkeypatch.setattr(
        "routes.frames.get_sky_image_png", lambda *_, **__: b"\x89PNG"
    )
    monkeypatch.setattr(
        "routes.metadata.get_coordinate_metadata",
        lambda *_: pytest.fail("metadata lookup should not run for these requests"),
    )
    return app.test_client()


def test_exceeding_limit_returns_429_with_retry_after(client):
    assert client.get("/api/frames/image", query_string=IMAGE_ARGS).status_code == 200

    resp = client.get("/api/frames/image", query_string=IMAGE_ARGS)

    assert resp.status_code == 429
    assert resp.get_json() == {
        "error": {"code": "rate_limited", "message": "Too many requests. Try again later."}
    }
    assert int(resp.headers["Retry-After"]) > 0


def test_invalid_requests_count_toward_the_limit(client):
    bad = {"ra": "1", "dec": "95"}
    assert client.get("/api/metadata", query_string=bad).status_code == 400
    assert client.get("/api/metadata", query_string=bad).status_code == 400
    assert client.get("/api/metadata", query_string=bad).status_code == 429


def test_routes_have_independent_limits(client):
    assert client.get("/api/frames/image", query_string=IMAGE_ARGS).status_code == 200
    assert client.get("/api/frames/image", query_string=IMAGE_ARGS).status_code == 429

    resp = client.get("/api/metadata", query_string={"ra": "1", "dec": "95"})
    assert resp.status_code == 400


def test_limits_are_tracked_per_client_address(client):
    for addr, expected in [("10.0.0.1", 200), ("10.0.0.1", 429), ("10.0.0.2", 200)]:
        resp = client.get(
            "/api/frames/image",
            query_string=IMAGE_ARGS,
            environ_base={"REMOTE_ADDR": addr},
        )
        assert resp.status_code == expected


def test_forwarded_headers_do_not_bypass_the_limit(client):
    assert client.get("/api/frames/image", query_string=IMAGE_ARGS).status_code == 200

    resp = client.get(
        "/api/frames/image",
        query_string=IMAGE_ARGS,
        headers={"X-Forwarded-For": "203.0.113.9"},
    )
    assert resp.status_code == 429
