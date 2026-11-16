import math
from datetime import date

import numpy as np
import pytest
from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS

from app import app
from schemas.query import QueryValidationError
from schemas.spectrum import parse_chunk_spectrum_query
from services import hips_cube, spectrum_service
from services.frames_service import ImageNotFoundError
from services.irsa_archive import ArchiveUnavailableError
from services.spectrum_service import (
    FrameGeometry,
    SpectrumUnavailableError,
    chunk_at,
    chunk_corners_pixels,
    chunk_grid,
)

RA, DEC = 10.0, 20.0
CUBE_PIX_ARCSEC = 12.9
FRAME_PIX_ARCSEC = 6.15
N_CHANNELS = 4
CUBE_NPIX = 60
BASELINE = 5.0
VALID_ARGS = {
    "ra": str(RA),
    "dec": str(DEC),
    "observationDate": "2025-05-01",
    "fieldSizeDeg": "0.05",
    "x": "0.25",
    "y": "0.75",
}


def _cube_wcs_header() -> fits.Header:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [RA, DEC]
    w.wcs.crpix = [CUBE_NPIX / 2 + 0.5, CUBE_NPIX / 2 + 0.5]
    w.wcs.cdelt = [-CUBE_PIX_ARCSEC / 3600, CUBE_PIX_ARCSEC / 3600]
    hdr = w.to_header()
    # Spectral -TAB axis like the real cube: celestial_wcs must ignore it.
    hdr["CTYPE3"] = "WAVE-TAB"
    hdr["PS3_0"] = "WCS-WAVE"
    return hdr


def _frame_geometry(rotation_deg: float = 30.0, npix: int = 29) -> FrameGeometry:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [RA, DEC]
    w.wcs.crpix = [(npix + 1) / 2, (npix + 1) / 2]
    w.wcs.cdelt = [-FRAME_PIX_ARCSEC / 3600, FRAME_PIX_ARCSEC / 3600]
    t = math.radians(rotation_deg)
    w.wcs.pc = [[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]]
    return FrameGeometry(w, (npix, npix))


@pytest.fixture
def frame_geometry():
    return _frame_geometry()


@pytest.fixture
def cube_file(tmp_path, frame_geometry):
    """A small MEF shaped like a SPHEREx HiPS cube, with a bright 'source' under chunk (0, 0)."""
    hdr = _cube_wcs_header()
    image = np.full((N_CHANNELS, CUBE_NPIX, CUBE_NPIX), BASELINE, dtype=np.float32)
    image += np.arange(N_CHANNELS, dtype=np.float32)[:, None, None]

    grid = chunk_grid(frame_geometry)
    xs, ys = chunk_corners_pixels(0, 0, grid, frame_geometry.shape)
    sky = frame_geometry.wcs.pixel_to_world(xs.mean(), ys.mean())
    cx, cy = (round(float(v)) for v in hips_cube.celestial_wcs(hdr).world_to_pixel(sky))
    image[:, cy - 1 : cy + 2, cx - 1 : cx + 2] = 100.0

    image_hdu = fits.ImageHDU(image, header=hdr, name="IMAGE")
    image_hdu.header["BUNIT"] = "MJy/sr"
    channels = Table(
        {
            "WAVELENGTH": [4.5, 0.8, 2.0, 1.2],  # deliberately unsorted
            "BANDWIDTH": [0.04, 0.01, 0.02, 0.015],
        }
    )
    path = tmp_path / "Npix1_cube.fits"
    fits.HDUList(
        [
            fits.PrimaryHDU(),
            image_hdu,
            fits.ImageHDU(np.ones(image.shape, dtype=np.int16), name="NHITS"),
            fits.ImageHDU(np.zeros(image.shape, dtype=np.int32), name="FLAGS"),
            fits.BinTableHDU(channels, name="SPECTRAL_CHANNELS"),
        ]
    ).writeto(path)
    return str(path)


@pytest.fixture
def wired(monkeypatch, cube_file, frame_geometry):
    """Point the service at the synthetic frame and cube, reading the cube by byte ranges."""
    monkeypatch.setattr(hips_cube, "tile_url", lambda ra, dec: cube_file)
    monkeypatch.setattr(hips_cube, "http_range_fetch", hips_cube.file_range_fetch)
    monkeypatch.setattr(spectrum_service, "get_frame_geometry", lambda *a, **k: frame_geometry)


# --- schema -----------------------------------------------------------------


def test_parse_chunk_query():
    q = parse_chunk_spectrum_query(VALID_ARGS)
    assert (q.x, q.y) == (0.25, 0.75)
    assert q.sky.observation_date == date(2025, 5, 1)


@pytest.mark.parametrize("overrides", [{"x": ""}, {"y": "abc"}, {"x": "1.5"}, {"y": "-0.1"}, {"x": "nan"}])
def test_parse_chunk_query_rejects_bad_position(overrides):
    with pytest.raises(QueryValidationError):
        parse_chunk_spectrum_query({**VALID_ARGS, **overrides})


# --- HiPS cube reader --------------------------------------------------------


def test_reads_only_the_requested_rows(cube_file):
    fetched = []

    def counting_fetch(url, start, end):
        fetched.append(end - start + 1)
        return hips_cube.file_range_fetch(url, start, end)

    hdus = hips_cube.scan_hdus(cube_file, counting_fetch, {"IMAGE", "SPECTRAL_CHANNELS"})
    fetched.clear()
    region = hips_cube.read_cube_rows(cube_file, counting_fetch, hdus["IMAGE"], 10, 15, 20, 26)

    with fits.open(cube_file) as hdul:
        np.testing.assert_array_equal(region, hdul["IMAGE"].data[:, 10:15, 20:26])
        # One contiguous range per layer, covering only rows 10..14.
        assert fetched == [5 * CUBE_NPIX * 4] * N_CHANNELS
        table = hips_cube.read_table(cube_file, hips_cube.file_range_fetch, hdus["SPECTRAL_CHANNELS"])
        assert list(table["WAVELENGTH"]) == list(hdul["SPECTRAL_CHANNELS"].data["WAVELENGTH"])


def test_celestial_wcs_ignores_spectral_tab_axis():
    w = hips_cube.celestial_wcs(_cube_wcs_header())
    assert w.naxis == 2
    sky = w.pixel_to_world(CUBE_NPIX / 2 - 0.5, CUBE_NPIX / 2 - 0.5)  # CRPIX is 1-based
    assert sky.ra.deg == pytest.approx(RA, abs=1e-6)
    assert sky.dec.deg == pytest.approx(DEC, abs=1e-6)


def test_load_field_cube_falls_back_to_full_download(monkeypatch, cube_file):
    def no_ranges(url, start, end):
        raise hips_cube.RangeNotSupportedError(url)

    monkeypatch.setattr(hips_cube, "tile_url", lambda ra, dec: "https://example.invalid/cube.fits")
    monkeypatch.setattr(hips_cube, "http_range_fetch", no_ranges)
    monkeypatch.setattr(hips_cube, "download_file", lambda url, **kw: cube_file)

    cube = hips_cube.load_field_cube(RA, DEC, 0.05 * 0.75)
    assert cube.data.shape[0] == N_CHANNELS
    assert cube.unit == "MJy/sr"


def test_load_field_cube_rejects_position_outside_tile(monkeypatch, cube_file):
    monkeypatch.setattr(hips_cube, "tile_url", lambda ra, dec: cube_file)
    with pytest.raises(hips_cube.OutsideTileError):
        hips_cube.load_field_cube(RA + 5, DEC, 0.01, fetch=hips_cube.file_range_fetch)


def test_tile_url_uses_nested_order5_layout():
    url = hips_cube.tile_url(60.8109955, 51.3404038)
    assert "/Norder5/Dir" in url and url.endswith("_cube.fits")


# --- chunk geometry ----------------------------------------------------------


def test_chunk_grid_targets_chunk_size(frame_geometry):
    grid = chunk_grid(frame_geometry)  # 29 px * 6.15" ~ 178" / 26" ~ 7
    assert (grid.rows, grid.cols) == (7, 7)
    assert grid.chunk_arcsec == pytest.approx(29 * FRAME_PIX_ARCSEC / 7)


def test_chunk_at_clamps_edges(frame_geometry):
    grid = chunk_grid(frame_geometry)
    assert chunk_at(0.0, 0.0, grid) == (0, 0)
    assert chunk_at(1.0, 1.0, grid) == (6, 6)
    assert chunk_at(0.99, 0.01, grid) == (0, 6)


def test_chunk_row_zero_is_top_of_image(frame_geometry):
    grid = chunk_grid(frame_geometry)
    _, ys = chunk_corners_pixels(0, 0, grid, frame_geometry.shape)
    assert ys.max() == pytest.approx(frame_geometry.shape[0] - 0.5)


# --- end to end service ------------------------------------------------------


def test_chunk_spectrum_finds_source_in_clicked_chunk(wired):
    on_source = spectrum_service.chunk_spectrum(RA, DEC, date(2025, 5, 1), 0.05, 0.02, 0.02)
    off_source = spectrum_service.chunk_spectrum(RA, DEC, date(2025, 5, 1), 0.05, 0.5, 0.5)

    assert on_source["chunk"]["row"] == 0 and on_source["chunk"]["col"] == 0
    assert min(p["flux"] for p in on_source["points"]) > 50
    assert max(p["flux"] for p in off_source["points"]) < 10
    waves = [p["wavelengthUm"] for p in off_source["points"]]
    assert waves == sorted(waves) and len(waves) == N_CHANNELS
    assert off_source["unit"] == "MJy/sr"
    assert off_source["chunk"]["bounds"] == pytest.approx(
        {"left": 3 / 7, "top": 3 / 7, "width": 1 / 7, "height": 1 / 7}
    )
    assert off_source["center"]["ra"] == pytest.approx(RA, abs=1e-3)


def test_chunk_spectrum_without_coverage(wired, cube_file):
    with fits.open(cube_file, mode="update") as hdul:
        hdul["IMAGE"].data[:] = np.nan
    with pytest.raises(SpectrumUnavailableError):
        spectrum_service.chunk_spectrum(RA, DEC, date(2025, 5, 1), 0.05, 0.5, 0.5)


def test_cube_download_errors_become_archive_errors(monkeypatch):
    def boom(*a, **k):
        raise OSError("network down")

    monkeypatch.setattr(hips_cube, "load_field_cube", boom)
    with pytest.raises(ArchiveUnavailableError):
        spectrum_service.get_field_cube(RA, DEC, 0.05)


# --- route -------------------------------------------------------------------


@pytest.fixture
def client():
    return app.test_client()


def test_route_returns_spectrum(client, wired):
    resp = client.get("/api/frames/spectrum", query_string=VALID_ARGS)
    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body) == {"chunk", "center", "pixelCount", "unit", "source", "points"}
    assert set(body["points"][0]) == {"wavelengthUm", "bandwidthUm", "flux"}
    assert resp.headers["Cache-Control"] == "public, max-age=3600"


def test_route_rejects_invalid_query(client):
    resp = client.get("/api/frames/spectrum", query_string={**VALID_ARGS, "x": "2"})
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize(
    "exc, status, code",
    [
        (ImageNotFoundError("none"), 404, "image_not_found"),
        (SpectrumUnavailableError("none"), 404, "spectrum_unavailable"),
        (ArchiveUnavailableError("down"), 502, "spectrum_source_unavailable"),
    ],
)
def test_route_maps_errors(client, monkeypatch, exc, status, code):
    def fail(*a, **k):
        raise exc

    monkeypatch.setattr("routes.spectrum.chunk_spectrum", fail)
    resp = client.get("/api/frames/spectrum", query_string=VALID_ARGS)
    assert resp.status_code == status
    assert resp.get_json()["error"]["code"] == code
    assert "Traceback" not in resp.get_data(as_text=True)
