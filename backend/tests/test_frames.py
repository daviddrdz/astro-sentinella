from datetime import date

import pytest
from astropy.table import Table
from astropy.time import Time

from app import app
from schemas.query import QueryValidationError, parse_sky_image_query
from services import frames_service, irsa_archive
from services.image_renderer import render_image_png
from services.frames_service import ImageNotFoundError, select_image_url_for_date
from services.irsa_archive import ArchiveUnavailableError

VALID_ARGS = {"ra": "133.795", "dec": "-7.2455", "observationDate": "2025-05-01"}


@pytest.fixture
def client():
    return app.test_client()


def _mjd(iso: str) -> float:
    return Time(iso, scale="utc").mjd


def test_parse_accepts_degrees_and_sexagesimal():
    q = parse_sky_image_query({**VALID_ARGS, "ra": "05h 35m 17s", "dec": "-05° 23' 28\""})
    assert q.ra_deg == pytest.approx(83.8208, abs=1e-3)
    assert q.dec_deg == pytest.approx(-5.3911, abs=1e-3)
    assert q.observation_date == date(2025, 5, 1)


@pytest.mark.parametrize(
    "overrides",
    [
        {"ra": ""},
        {"ra": "abc"},
        {"ra": "360"},
        {"dec": "91"},
        {"dec": "nan"},
        {"observationDate": "05/01/2025"},
        {"observationDate": ""},
    ],
)
def test_parse_rejects_invalid_input(overrides):
    with pytest.raises(QueryValidationError):
        parse_sky_image_query({**VALID_ARGS, **overrides})


def test_select_image_picks_earliest_on_date():
    table = Table(
        {
            "t_min": [_mjd("2025-04-30T23:59:00"), _mjd("2025-05-01T18:00:00"), _mjd("2025-05-01T02:00:00")],
            "access_url": ["prev-day", "late", "early"],
        }
    )
    assert select_image_url_for_date(table, date(2025, 5, 1)) == "early"
    assert select_image_url_for_date(table, date(2025, 5, 2)) is None
    assert select_image_url_for_date(table[:0], date(2025, 5, 1)) is None


def test_image_route_returns_png(client, monkeypatch):
    calls = []

    def fake(*args, **kwargs):
        calls.append((args, kwargs))
        return b"\x89PNG fake"

    monkeypatch.setattr("routes.frames.get_sky_image_png", fake)
    resp = client.get("/api/frames/image", query_string=VALID_ARGS)

    assert resp.status_code == 200
    assert resp.mimetype == "image/png"
    assert resp.data == b"\x89PNG fake"
    assert calls == [
        ((133.795, -7.2455, date(2025, 5, 1)), {"color": "magma"})
    ]


def test_image_route_accepts_render_color(client, monkeypatch):
    calls = []

    def fake(*args, **kwargs):
        calls.append((args, kwargs))
        return b"\x89PNG fake"

    monkeypatch.setattr("routes.frames.get_sky_image_png", fake)
    resp = client.get(
        "/api/frames/image",
        query_string={**VALID_ARGS, "color": "inferno"},
    )

    assert resp.status_code == 200
    assert calls == [
        ((133.795, -7.2455, date(2025, 5, 1)), {"color": "inferno"})
    ]


def test_image_route_rejects_invalid_render_color(client):
    resp = client.get(
        "/api/frames/image",
        query_string={**VALID_ARGS, "color": "rainbow"},
    )
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "invalid_request"


def test_image_route_rejects_invalid_query(client):
    resp = client.get("/api/frames/image", query_string={**VALID_ARGS, "dec": "100"})
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "invalid_request"


def test_image_route_returns_404_when_no_image_on_date(client, monkeypatch):
    def fake(*_, **__):
        raise ImageNotFoundError("No image found.")

    monkeypatch.setattr("routes.frames.get_sky_image_png", fake)
    resp = client.get("/api/frames/image", query_string=VALID_ARGS)
    assert resp.status_code == 404
    assert resp.get_json()["error"]["code"] == "image_not_found"


def test_image_route_hides_upstream_errors(client, monkeypatch):
    def fake(*_, **__):
        raise ArchiveUnavailableError("secret upstream detail")

    monkeypatch.setattr("routes.frames.get_sky_image_png", fake)
    resp = client.get("/api/frames/image", query_string=VALID_ARGS)
    assert resp.status_code == 502
    assert "secret" not in resp.get_data(as_text=True)


def test_render_png_produces_png_bytes(monkeypatch, tmp_path):
    import numpy as np
    from astropy.io import fits

    path = tmp_path / "img.fits"
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.random.rand(16, 16))]).writeto(path)

    png = frames_service._render_png(str(path))
    assert png.startswith(b"\x89PNG")


def test_render_png_reuses_download_for_different_colors(monkeypatch):
    import numpy as np
    from astropy.wcs import WCS

    calls = []

    def download(source, ra_deg, dec_deg, size_deg):
        calls.append((source, ra_deg, dec_deg, size_deg))
        return np.arange(256, dtype=float).reshape(16, 16), WCS()

    monkeypatch.setattr(
        frames_service,
        "_find_image_url",
        lambda *_: "https://example/img.fits",
    )
    monkeypatch.setattr(frames_service, "_download_render_image", download)

    first = frames_service.get_sky_image_png(
        133.795, -7.2455, date(2025, 5, 1), 0.5, "magma"
    )
    second = frames_service.get_sky_image_png(
        133.795, -7.2455, date(2025, 5, 1), 0.5, "inferno"
    )

    assert first.startswith(b"\x89PNG")
    assert second.startswith(b"\x89PNG")
    assert len(calls) == 1


def test_render_image_png_supports_multiple_bands():
    import numpy as np
    from astropy.wcs import WCS

    def loader(source):
        return np.arange(256, dtype=float).reshape(16, 16) + int(source), WCS()

    png = render_image_png(
        {
            "sources": {1: "1", 2: "2"},
            "ra": 133.795,
            "dec": -7.2455,
        },
        bands=[1, 2],
        target_px=100,
        image_loader=loader,
    )

    assert png.startswith(b"\x89PNG")


def test_find_image_url_raises_not_found_for_date_without_images(monkeypatch):
    table = Table({"t_min": [_mjd("2025-05-05T10:00:00")], "access_url": ["u"]})
    monkeypatch.setattr(frames_service, "search_images", lambda ra, dec: table)

    assert frames_service._find_image_url(1.0, 2.0, date(2025, 5, 5)) == "u"
    with pytest.raises(ImageNotFoundError):
        frames_service._find_image_url(1.0, 2.0, date(2025, 5, 6))


def test_image_download_retries_then_fails(monkeypatch):
    attempts = []
    monkeypatch.setattr(irsa_archive.time, "sleep", lambda _: None)

    def broken(url, *args):
        attempts.append(url)
        raise OSError("connection reset")

    monkeypatch.setattr(frames_service, "_download_render_image", broken)
    with pytest.raises(ArchiveUnavailableError):
        frames_service._render_png("https://example/img.fits")
