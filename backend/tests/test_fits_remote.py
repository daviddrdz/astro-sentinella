import io

import numpy as np
import pytest
from astropy.io import fits

from services import fits_remote, irsa_archive
from services.fits_remote import (
    RemoteFitsError,
    find_hdu,
    hdu_layout,
    read_image_window,
    read_table,
    s3_url,
)
from tests import fake_spherex

URL = "https://example.test/level2_D1.fits"


@pytest.fixture
def remote(monkeypatch):
    data = fake_spherex.make_level2_bytes(detector=1)
    transport = fake_spherex.install(monkeypatch, {URL: data})
    with fits.open(io.BytesIO(data)) as hdul:
        offsets = [(hdu.name, hdu._data_offset, hdu._data_size) for hdu in hdul]  # padded sizes
    return transport, data, offsets


def test_s3_url_maps_ibe_path_to_bucket_key():
    url = s3_url(fake_spherex.ibe_url("2025W28_2A/x/1/file.fits"))
    assert url == fits_remote.S3_BASE + "dr1/level2/2025W28_2A/x/1/file.fits"
    with pytest.raises(ValueError):
        s3_url("https://example.test/other.fits")


def test_layout_matches_astropy_offsets_reading_only_headers(remote):
    transport, data, offsets = remote

    layout = hdu_layout(URL)

    assert [(h.name, h.data_start, fits_remote._padded(h.data_len)) for h in layout] == offsets
    assert [h.name for h in layout] == [
        "PRIMARY", "IMAGE", "FLAGS", "VARIANCE", "ZODI", "EPSF", "WCS-WAVE"
    ]
    # One header-sized read per HDU at most.
    assert len(transport.requests) <= len(offsets)


def test_layout_is_cached_per_url(remote):
    transport, _, _ = remote
    hdu_layout(URL)
    fetched = len(transport.requests)

    hdu_layout(URL)

    assert len(transport.requests) == fetched


def test_image_window_reads_exact_pixels(remote):
    transport, data, _ = remote
    layout = hdu_layout(URL)
    transport.requests.clear()
    with fits.open(io.BytesIO(data)) as hdul:
        expected = hdul["IMAGE"].data

    window = read_image_window(URL, find_hdu(layout, "IMAGE"), 10, 12, 20, 22)

    np.testing.assert_allclose(window, expected[10:13, 20:23])
    assert len(transport.requests) == 1
    single = read_image_window(URL, find_hdu(layout, "IMAGE"), 5, 5, 7, 7)
    assert single.shape == (1, 1) and single[0, 0] == pytest.approx(expected[5, 7])
    assert transport.requests[-1][2] - transport.requests[-1][1] + 1 == 4


def test_image_window_rejects_out_of_bounds(remote):
    layout = hdu_layout(URL)
    with pytest.raises(ValueError):
        read_image_window(URL, find_hdu(layout, "IMAGE"), -1, 0, 0, 0)
    with pytest.raises(ValueError):
        read_image_window(URL, find_hdu(layout, "IMAGE"), 0, 0, 0, fake_spherex.SIZE)


def test_read_table_returns_wave_grid(remote):
    layout = hdu_layout(URL)

    table = read_table(URL, find_hdu(layout, "WCS-WAVE"))

    row = table.data[0]
    assert list(row["X"]) == [1, fake_spherex.SIZE // 2, fake_spherex.SIZE]
    assert np.asarray(row["VALUES"]).shape == (3, 3, 2)


def test_missing_extension_raises(remote):
    with pytest.raises(RemoteFitsError):
        find_hdu(hdu_layout(URL), "NOPE")


def test_fetch_does_not_retry_client_errors(monkeypatch):
    calls = []

    class Resp:
        status_code = 404
        headers = {}
        content = b""

    class Session:
        def get(self, *args, **kwargs):
            calls.append(1)
            return Resp()

    monkeypatch.setattr(fits_remote, "_session", Session())
    monkeypatch.setattr(irsa_archive.time, "sleep", lambda _s: None)

    with pytest.raises(RemoteFitsError):
        fits_remote.read_range(URL, 0, 10)
    assert len(calls) == 1
