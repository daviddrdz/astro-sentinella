import io
import warnings

import numpy as np
import pytest
from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS

from app import app
from schemas.query import QueryValidationError, parse_spectrum_query
from services import level2_spectrum as spectrum_service
from services.irsa_archive import ArchiveUnavailableError
from services.level2_spectrum import (
    BINS_PER_DETECTOR,
    NoCoverageError,
    Sample,
    WaveGrid,
    bin_samples,
    exposures_from_table,
    extract_spectrum,
    sample_exposure,
)
from tests import fake_spherex

RA, DEC = 10.0, 20.0
CENTER_PX = fake_spherex.SIZE // 2


def _table(names_detectors):
    return Table(
        {
            "access_url": [fake_spherex.ibe_url(name) for name, _ in names_detectors],
            "energy_bandpassname": [f"SPHEREx-D{d}" for _, d in names_detectors],
            "obs_id": [name.split("_D")[0] for name, _ in names_detectors],
            "t_min": [60800.0 + i for i in range(len(names_detectors))],
        }
    )


@pytest.fixture
def archive(monkeypatch):
    """Three exposures (detectors 1, 1, 2) served from memory; returns (transport, files)."""
    names = [("a_D1.fits", 1), ("b_D1.fits", 1), ("c_D2.fits", 2)]
    files = {}
    for name, det in names:
        files[spectrum_service.fits_remote.s3_url(fake_spherex.ibe_url(name))] = (
            fake_spherex.make_level2_bytes(detector=det)
        )
    transport = fake_spherex.install(monkeypatch, files)
    monkeypatch.setattr(spectrum_service, "search_images", lambda ra, dec, radius: _table(names))
    return transport, files


def test_exposures_from_table_dedupes_and_filters():
    table = _table([("a_D1.fits", 1), ("a_D1.fits", 1), ("c_D2.fits", 2), ("d_D3.fits", 3)])

    exposures = exposures_from_table(table)
    assert [(e.detector, e.obs_id) for e in exposures] == [(1, "a"), (2, "c"), (3, "d")]
    assert [e.detector for e in exposures_from_table(table, (2, 3))] == [2, 3]


def test_exposures_fall_back_to_detector_in_url():
    table = Table({"access_url": [fake_spherex.ibe_url("x/4/level2_2025W28_0101_1D4_spx.fits")]})
    assert exposures_from_table(table)[0].detector == 4


def test_wave_grid_matches_astropy_tab_wcs(archive):
    _, files = archive
    data = next(iter(files.values()))
    with fits.open(io.BytesIO(data)) as hdul, warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wcs = WCS(hdul["IMAGE"].header, fobj=hdul, key="W")
        row = hdul["WCS-WAVE"].data[0]
        grid = WaveGrid(np.asarray(row["X"], float), np.asarray(row["Y"], float), np.asarray(row["VALUES"], float))
        header = hdul["IMAGE"].header
        for col, row_px in ((0, 0), (7, 31), (39, 39), (CENTER_PX, CENTER_PX)):
            expected = wcs.pixel_to_world_values(col, row_px)
            got = grid.at(*spectrum_service._raw_pixel(header, col, row_px))
            assert got == pytest.approx([float(v) for v in expected], rel=1e-5)


def test_sample_exposure_reads_pixel_at_coordinate(archive):
    transport, files = archive
    url = fake_spherex.ibe_url("a_D1.fits")
    data = files[spectrum_service.fits_remote.s3_url(url)]
    with fits.open(io.BytesIO(data)) as hdul:
        image, zodi = hdul["IMAGE"].data, hdul["ZODI"].data
    exposure = spectrum_service.Exposure(url, "a", 60800.0, 1)

    sample = sample_exposure(exposure, RA, DEC, aperture_px=1)

    assert sample.detector == 1
    assert sample.flux == pytest.approx(image[CENTER_PX, CENTER_PX] - zodi[CENTER_PX, CENTER_PX], rel=1e-6)
    assert sample.error == pytest.approx(0.1)
    assert sample.zodi == pytest.approx(0.3)
    assert 0.75 <= sample.wavelength <= 1.06
    assert sample.detector_range == pytest.approx((0.75, 1.06))


def test_sample_exposure_averages_aperture(archive):
    _, files = archive
    url = fake_spherex.ibe_url("a_D1.fits")
    with fits.open(io.BytesIO(files[spectrum_service.fits_remote.s3_url(url)])) as hdul:
        image = hdul["IMAGE"].data
    exposure = spectrum_service.Exposure(url, "a", 60800.0, 1)

    sample = sample_exposure(exposure, RA, DEC, aperture_px=3)

    window = image[CENTER_PX - 1 : CENTER_PX + 2, CENTER_PX - 1 : CENTER_PX + 2]
    assert sample.flux == pytest.approx(float(window.mean()) - 0.3, rel=1e-5)
    assert sample.error == pytest.approx(np.sqrt(9 * 0.01) / 9)


def test_sample_exposure_returns_none_off_detector(archive):
    exposure = spectrum_service.Exposure(fake_spherex.ibe_url("a_D1.fits"), "a", 60800.0, 1)
    assert sample_exposure(exposure, RA + 1.0, DEC, aperture_px=1) is None


def _sample(wave, flux, det=1, err=0.1):
    return Sample(wave, 0.02, flux, err, 0.0, det, "obs", 60800.0, (1.0, 2.0))


def test_bin_samples_clips_outliers_and_weights_by_variance():
    samples = [_sample(1.01, 1.0), _sample(1.02, 1.1), _sample(1.03, 0.9), _sample(1.015, 50.0)]
    samples.append(_sample(1.52, 2.0, err=0.1))
    samples.append(_sample(1.53, 4.0, err=1.0))

    binned = bin_samples(samples, {1: (1.0, 2.0)})

    assert len(binned) == 2
    first, second = binned
    assert first["n"] == 3 and first["flux"] == pytest.approx(1.0, abs=1e-6)
    assert first["wavelengthMinUm"] == pytest.approx(1.0)
    assert second["n"] == 2
    assert second["flux"] == pytest.approx((2.0 / 0.01 + 4.0 / 1.0) / (1 / 0.01 + 1 / 1.0))
    assert second["error"] == pytest.approx(np.sqrt(1 / (1 / 0.01 + 1 / 1.0)))
    assert all(b["detector"] == 1 for b in binned)


def test_bin_samples_caps_bins_per_detector():
    samples = [_sample(w, 1.0) for w in np.linspace(1.0, 1.999, 500)]
    binned = bin_samples(samples, {1: (1.0, 2.0)})
    assert len(binned) == BINS_PER_DETECTOR


def test_extract_spectrum_assembles_payload(archive):
    transport, _ = archive

    payload = extract_spectrum(RA, DEC)

    assert payload["position"] == {"ra": RA, "dec": DEC}
    assert payload["unit"] == "MJy/sr"
    assert payload["status"] == "complete"
    assert payload["coverage"] == {
        "exposures": 3, "used": 3, "outOfBounds": 0, "failed": 0, "timedOut": 0, "detectors": [1, 2]
    }
    waves = [p["wavelengthUm"] for p in payload["points"]]
    assert waves == sorted(waves)
    assert {p["detector"] for p in payload["points"]} == {1, 2}
    assert {b["detector"] for b in payload["binned"]} == {1, 2}
    assert set(payload["points"][0]) == {
        "wavelengthUm", "bandwidthUm", "flux", "error", "zodi", "detector", "obsId", "mjd"
    }
    # Only two WCS-WAVE table reads (one per detector) despite three exposures.
    wave_starts = {
        (url, spectrum_service.fits_remote.find_hdu(spectrum_service.fits_remote.hdu_layout(url), "WCS-WAVE").data_start)
        for url in transport.files
    }
    wave_reads = [r for r in transport.requests if (r[0], r[1]) in wave_starts]
    assert len(wave_reads) == 2


def test_extract_spectrum_is_cached(archive):
    transport, _ = archive
    extract_spectrum(RA, DEC)
    seen = len(transport.requests)
    extract_spectrum(RA, DEC)
    assert len(transport.requests) == seen


def test_extract_spectrum_reports_partial_on_failures(archive, monkeypatch):
    real = spectrum_service.sample_exposure

    def flaky(exposure, *args):
        if exposure.obs_id == "b":
            raise OSError("boom")
        return real(exposure, *args)

    monkeypatch.setattr(spectrum_service, "sample_exposure", flaky)

    payload = extract_spectrum(RA, DEC)

    assert payload["status"] == "partial"
    assert payload["coverage"]["failed"] == 1 and payload["coverage"]["used"] == 2


def test_extract_spectrum_without_coverage(monkeypatch):
    monkeypatch.setattr(spectrum_service, "search_images", lambda ra, dec, radius: _table([]))
    with pytest.raises(NoCoverageError):
        extract_spectrum(RA, DEC)


def test_search_is_shared_within_a_grid_cell(monkeypatch, archive):
    calls = []
    original = spectrum_service.search_images

    def recording(ra, dec, radius):
        calls.append((ra, dec, radius))
        return original(ra, dec, radius)

    monkeypatch.setattr(spectrum_service, "search_images", recording)
    extract_spectrum(RA, DEC)
    extract_spectrum(RA + 0.012, DEC - 0.02)

    assert len(calls) == 2
    assert calls[0] == calls[1]
    assert calls[0][2] == spectrum_service.SEARCH_RADIUS_DEG


def test_partial_results_are_not_cached(archive, monkeypatch):
    attempts = []
    real = spectrum_service.sample_exposure

    def fail_once(exposure, *args):
        if exposure.obs_id == "b" and not attempts:
            attempts.append(1)
            raise OSError("boom")
        return real(exposure, *args)

    monkeypatch.setattr(spectrum_service, "sample_exposure", fail_once)

    assert extract_spectrum(RA, DEC)["status"] == "partial"
    assert extract_spectrum(RA, DEC)["status"] == "complete"


# --- schema ---------------------------------------------------------------

def test_parse_spectrum_query_defaults_and_options():
    q = parse_spectrum_query({"ra": "10", "dec": "20"})
    assert (q.ra_deg, q.dec_deg, q.aperture_px, q.detectors) == (10.0, 20.0, 1, ())
    q = parse_spectrum_query({"ra": "10", "dec": "20", "aperturePx": "3", "detectors": "1,4"})
    assert (q.aperture_px, q.detectors) == (3, (1, 4))


@pytest.mark.parametrize(
    "args",
    [{"aperturePx": "2"}, {"aperturePx": "x"}, {"detectors": "7"}, {"detectors": "1,1"}, {"dec": "95"}],
)
def test_parse_spectrum_query_rejects_invalid(args):
    with pytest.raises(QueryValidationError):
        parse_spectrum_query({"ra": "10", "dec": "20", **args})


# --- route ----------------------------------------------------------------

@pytest.fixture
def client():
    return app.test_client()


def test_route_returns_payload(client, monkeypatch):
    monkeypatch.setattr(
        "routes.level2_spectrum.extract_spectrum",
        lambda ra, dec, ap, dets: {"position": {"ra": ra, "dec": dec}, "aperturePx": ap, "points": []},
    )
    resp = client.get("/api/spectrum/observations", query_string={"ra": "10", "dec": "20", "aperturePx": "3"})
    assert resp.status_code == 200
    assert resp.get_json()["aperturePx"] == 3
    assert resp.headers["Cache-Control"] == "public, max-age=3600"


def test_route_validates_input(client):
    resp = client.get("/api/spectrum/observations", query_string={"ra": "10", "dec": "20", "aperturePx": "2"})
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "invalid_request"


def test_route_maps_service_errors(client, monkeypatch):
    def raise_(exc):
        def _inner(*_):
            raise exc
        return _inner

    monkeypatch.setattr("routes.level2_spectrum.extract_spectrum", raise_(NoCoverageError("none")))
    assert client.get("/api/spectrum/observations", query_string={"ra": "10", "dec": "20"}).status_code == 404

    monkeypatch.setattr("routes.level2_spectrum.extract_spectrum", raise_(ArchiveUnavailableError()))
    resp = client.get("/api/spectrum/observations", query_string={"ra": "10", "dec": "20"})
    assert resp.status_code == 502
    assert resp.get_json()["error"]["code"] == "image_source_unavailable"
