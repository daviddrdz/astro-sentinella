import base64
import sys
import types
from datetime import date

import pytest

from app import app
from services.frames_service import ImageNotFoundError
from services.subtraction_service import subtract_observations

VALID_BODY = {
    "ra": "08h 55m 10.831s",
    "dec": "-07d 14m 42.53s",
    "observationDateA": "2025-05-05",
    "observationDateB": "2025-11-03",
    "detector": 2,
}


@pytest.fixture
def client():
    return app.test_client()


def test_subtract_endpoint_returns_png_and_summary(client, monkeypatch):
    calls = {}
    summary = {"candidates": [], "difference_image": {"flux_scale_k": 1.0}}

    def fake_subtract(*args):
        calls["args"] = args
        return b"\x89PNG image", summary

    monkeypatch.setattr("routes.subtraction.subtract_observations", fake_subtract)
    response = client.post(
        "/api/subtract",
        json={
            **VALID_BODY,
            "size": 256,
            "scaleMode": "none",
            "findSources": False,
            "thresh": 7,
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert base64.b64decode(body["imageDataUrl"].removeprefix("data:image/png;base64,")) == (
        b"\x89PNG image"
    )
    assert body["summary"] == summary
    ra, dec, date_a, date_b, detector, size, options = calls["args"]
    assert ra == pytest.approx(133.795129, abs=1e-5)
    assert dec == pytest.approx(-7.245147, abs=1e-5)
    assert (date_a, date_b, detector, size) == (
        date(2025, 5, 5),
        date(2025, 11, 3),
        2,
        256,
    )
    assert options == {"scale_mode": "none", "thresh": 7.0, "find_sources": False}


def test_subtraction_service_selects_requested_dates_and_detector(monkeypatch):
    import services.subtraction_service as service

    sources = {
        date(2025, 5, 5): "fits-a",
        date(2025, 11, 3): "fits-b",
    }
    calls = {}

    def fake_select(table, observation_date, detector):
        calls.setdefault("selection", []).append((table, observation_date, detector))
        return sources[observation_date]

    def fake_algorithm(*args, **kwargs):
        calls["algorithm"] = (args, kwargs)
        return b"\x89PNG", {"summary": {}}

    monkeypatch.setattr(service, "search_images", lambda ra, dec: "catalog")
    monkeypatch.setattr(service, "select_image_url_for_date", fake_select)
    monkeypatch.setitem(
        sys.modules,
        "substraction",
        types.SimpleNamespace(subtract_to_png=fake_algorithm),
    )

    result = subtract_observations(
        12.0,
        -3.0,
        date(2025, 5, 5),
        date(2025, 11, 3),
        4,
        256,
        {"scale_mode": "none"},
    )

    assert result == (b"\x89PNG", {"summary": {}})
    assert calls["selection"] == [
        ("catalog", date(2025, 5, 5), 4),
        ("catalog", date(2025, 11, 3), 4),
    ]
    assert calls["algorithm"] == (
        ("fits-a", "fits-b", 12.0, -3.0, 256),
        {"scale_mode": "none"},
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"observationDateA": "not-a-date"},
        {"observationDateB": "2025-05-05"},
        {"detector": 7},
        {"size": 4096},
        {"ra": "not-an-angle"},
    ],
)
def test_subtract_endpoint_rejects_invalid_input(client, monkeypatch, overrides):
    monkeypatch.setattr(
        "routes.subtraction.subtract_observations",
        lambda *_args: pytest.fail("invalid requests must not run subtraction"),
    )
    response = client.post("/api/subtract", json={**VALID_BODY, **overrides})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_subtract_endpoint_returns_not_found_when_date_has_no_image(client, monkeypatch):
    def missing_image(*_args):
        raise ImageNotFoundError("No detector D2 image found.")

    monkeypatch.setattr("routes.subtraction.subtract_observations", missing_image)
    response = client.post("/api/subtract", json=VALID_BODY)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "image_not_found"
