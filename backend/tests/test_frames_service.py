from datetime import date
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import numpy as np
import pytest
from astropy.io import fits
from astropy.table import MaskedColumn, Table
from astropy.time import Time
from astropy.wcs import WCS

from services import frames_service as frames
from services import image_renderer as renderer
from services.irsa_archive import ArchiveUnavailableError


DAY = date(2025, 5, 1)
START = Time("2025-05-01", scale="utc").mjd


def archive_table():
    return Table({
        "t_min": MaskedColumn(
            [START + 0.75, START - 0.01, START, START + 1, np.nan, START + 0.5],
            mask=[False, False, False, False, False, True],
        ),
        "access_url": ["late", "previous", "midnight", "next", "invalid", "masked"],
        "energy_bandpassname": ["D4", "D1", "D1", "D6", "D2", "D3"],
    })


def test_selection_uses_earliest_image_and_utc_day_boundaries():
    assert frames.select_image_url_for_date(archive_table(), DAY) == "midnight"
    assert frames.select_image_url_for_date(archive_table(), date(2025, 5, 2)) == "next"
    assert frames.select_image_url_for_date(archive_table(), date(2025, 5, 3)) is None


@pytest.mark.parametrize("table", [Table(), Table({"access_url": ["no-time"]})])
def test_missing_times_or_empty_results_have_no_frames(monkeypatch, table):
    monkeypatch.setattr(frames, "search_images", Mock(return_value=table))
    assert frames.select_image_url_for_date(table, DAY) is None
    assert frames.list_frames_for_date(1, 2, DAY) == []


def test_frame_timeline_is_sorted_and_image_urls_preserve_query(monkeypatch):
    search = Mock(return_value=archive_table())
    monkeypatch.setattr(frames, "search_images", search)
    result = frames.list_frames_for_date(133.795, -7.2455, DAY, 0.5)
    assert [frame["id"] for frame in result] == ["spherex-2-d1", "spherex-0-d4"]
    assert [frame["timestamp"] for frame in result] == ["00:00Z", "18:00Z"]
    for frame, detector in zip(result, [1, 4]):
        assert set(frame) == {"id", "timestamp", "band", "detector", "wavelengthMinUm", "wavelengthMaxUm", "filtered", "visible", "imageUrl"}
        assert frame["band"] == frame["detector"] == detector
        assert frame["wavelengthMinUm"] < frame["wavelengthMaxUm"]
        assert frame["filtered"] is False
        assert frame["visible"] is True
        url = urlsplit(frame["imageUrl"])
        assert url.path == "/api/frames/image"
        assert parse_qs(url.query) == {
            "ra": ["133.795"], "dec": ["-7.2455"], "fieldSizeDeg": ["0.5"],
            "observationDate": ["2025-05-01"], "detector": [str(detector)],
        }
    search.assert_called_once_with(133.795, -7.2455)


def test_missing_image_raises_not_found(monkeypatch):
    monkeypatch.setattr(frames, "search_images", Mock(return_value=Table()))
    with pytest.raises(frames.ImageNotFoundError, match="2025-05-01"):
        frames._find_image_url(1, 2, DAY)


@pytest.mark.parametrize("source,expected", [
    ("https://archive/image", "https://archive/image?center=1,2d&size=0.5d"),
    ("http://archive/image?file=a", "http://archive/image?file=a&center=1,2d&size=0.5d"),
    ("local.fits", "local.fits"),
])
def test_cutout_url(monkeypatch, source, expected):
    opened = Mock(return_value=fits.HDUList([
        fits.PrimaryHDU(), fits.ImageHDU(np.arange(16, dtype=np.float32).reshape(4, 4)),
    ]))
    monkeypatch.setattr(renderer, "_open_fits", opened)
    renderer._download_fits_image(source, 1, 2, 0.5)
    opened.assert_called_once_with(expected)


def _image_data(path, **options):
    data, _ = renderer._download_fits_image(path, 0, 0, 0.05, **options)
    return data


def write_fits(tmp_path, image, zodi=None, flags=None, named=True):
    hdus = [fits.PrimaryHDU(), fits.ImageHDU(np.asarray(image, dtype=np.float32),
                                           name="IMAGE" if named else None)]
    if zodi is not None:
        hdus.append(fits.ImageHDU(np.asarray(zodi, dtype=np.float32), name="ZODI"))
    if flags is not None:
        hdus.append(fits.ImageHDU(np.asarray(flags, dtype=np.uint32), name="FLAGS"))
    path = tmp_path / "image.fits"
    fits.HDUList(hdus).writeto(path)
    return str(path)


def test_download_subtracts_zodi_and_replaces_bad_pixels_with_median(tmp_path):
    path = write_fits(tmp_path, [[10, 20], [30, 40]], [[1, 2], [3, 4]], [[0, 1], [0, 0]])
    data = _image_data(path)
    np.testing.assert_array_equal(data, [[9, 27], [27, 36]])
    assert data.dtype == np.float32


def test_download_can_disable_subtraction_and_masking(tmp_path):
    path = write_fits(tmp_path, [[10, 20]], [[1, 2]], [[1, 1]])
    np.testing.assert_array_equal(
        _image_data(path, subtract_zodi=False, mask_bad_pixels=False),
        [[10, 20]],
    )


@pytest.mark.parametrize("image", [[[np.nan, np.inf]], [[10, 20]]])
def test_all_invalid_or_flagged_pixels_produce_zero_image(tmp_path, image):
    path = write_fits(tmp_path, image, flags=[[1, 1]])
    np.testing.assert_array_equal(_image_data(path), [[0, 0]])


def test_all_nonfinite_pixels_without_flags_produce_zero_image(tmp_path):
    path = write_fits(tmp_path, [[np.nan, np.inf, -np.inf]])
    np.testing.assert_array_equal(_image_data(path), [[0, 0, 0]])


def test_unnamed_image_extension_and_missing_optional_extensions(tmp_path):
    path = write_fits(tmp_path, [[1, np.nan, 3]], named=False)
    np.testing.assert_array_equal(_image_data(path), [[1, 2, 3]])


@pytest.mark.parametrize("data", [np.arange(16).reshape(4, 4), np.arange(24).reshape(4, 6)])
def test_renderer_produces_decodable_png(monkeypatch, data):
    from io import BytesIO
    from PIL import Image

    download = Mock(return_value=(data, WCS()))
    monkeypatch.setattr(frames, "_download_render_image", download)
    png = frames._render_png("source", 1, 2, 0.5)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    with Image.open(BytesIO(png)) as image:
        assert image.format == "PNG"
        scale = max(1, renderer.DEFAULT_TARGET_PX // max(data.shape))
        assert image.size == (data.shape[1] * scale, data.shape[0] * scale)
        image.verify()
    download.assert_called_once_with("source", 1, 2, 0.5)


def test_download_failures_are_retried_and_wrapped(monkeypatch):
    download = Mock(side_effect=OSError("connection failed"))
    sleep = Mock()
    monkeypatch.setattr(renderer, "_open_fits", download)
    monkeypatch.setattr("services.irsa_archive.time.sleep", sleep)
    with pytest.raises(ArchiveUnavailableError, match="Image download failed") as error:
        frames._render_png("source")
    assert isinstance(error.value.__cause__, OSError)
    assert download.call_count == 4
    assert [call.args[0] for call in sleep.call_args_list] == [1, 2, 4]


def test_png_cache_reuses_image_and_separates_query_parameters(monkeypatch):
    find = Mock(return_value="source")
    render = Mock(side_effect=[b"first", b"size", b"date", b"position"])
    monkeypatch.setattr(frames, "search_images", Mock(return_value=Table()))
    monkeypatch.setattr(frames, "_find_image_url", find)
    monkeypatch.setattr(frames, "_render_png", render)
    assert frames.get_sky_image_png(1, 2, DAY) == b"first"
    assert frames.get_sky_image_png(1, 2, DAY) == b"first"
    assert frames.get_sky_image_png(1, 2, DAY, 0.5) == b"size"
    assert frames.get_sky_image_png(1, 2, date(2025, 5, 2)) == b"date"
    assert frames.get_sky_image_png(3, 2, DAY) == b"position"
    assert render.call_count == find.call_count == 4


@pytest.mark.parametrize("bit", [0, 1, 2, 6, 9, 10, 11, 27])
def test_each_severe_flag_masks_the_pixel(tmp_path, bit):
    path = write_fits(tmp_path, [[10, 1000, 30]], flags=[[0, 1 << bit, 0]])
    np.testing.assert_array_equal(_image_data(path), [[10, 20, 30]])


@pytest.mark.parametrize("bit", [3, 4, 5, 7, 8, *range(12, 27), *range(28, 32)])
def test_non_severe_flags_preserve_the_pixel(tmp_path, bit):
    path = write_fits(tmp_path, [[10, 1000, 30]], flags=[[0, 1 << bit, 0]])
    np.testing.assert_array_equal(_image_data(path), [[10, 1000, 30]])


def test_combined_flags_still_mask_severe_pixels(tmp_path):
    path = write_fits(tmp_path, [[10, 1000, 30]], flags=[[0, (1 << 3) | (1 << 27), 0]])
    np.testing.assert_array_equal(_image_data(path), [[10, 20, 30]])


def test_download_recovers_after_transient_failure(monkeypatch):
    from io import BytesIO
    from PIL import Image

    download = Mock(side_effect=[OSError("temporary failure"), fits.HDUList([
        fits.PrimaryHDU(), fits.ImageHDU(np.arange(16, dtype=np.float32).reshape(4, 4)),
    ])])
    sleep = Mock()
    monkeypatch.setattr(renderer, "_open_fits", download)
    monkeypatch.setattr("services.irsa_archive.time.sleep", sleep)

    png = frames._render_png("source", 1, 2, 0.5)

    assert download.call_count == 2
    assert all(call.args == ("source",) for call in download.call_args_list)
    sleep.assert_called_once_with(1.0)
    with Image.open(BytesIO(png)) as image:
        assert image.format == "PNG"
        image.verify()


def test_failed_png_generation_can_be_retried_without_caching_error(monkeypatch):
    find = Mock(return_value="source")
    render = Mock(side_effect=[ArchiveUnavailableError("temporary failure"), b"recovered"])
    monkeypatch.setattr(frames, "search_images", Mock(return_value=Table()))
    monkeypatch.setattr(frames, "_find_image_url", find)
    monkeypatch.setattr(frames, "_render_png", render)

    with pytest.raises(ArchiveUnavailableError):
        frames.get_sky_image_png(1, 2, DAY)
    assert frames.get_sky_image_png(1, 2, DAY) == b"recovered"
    assert frames.get_sky_image_png(1, 2, DAY) == b"recovered"
    assert render.call_count == find.call_count == 2


@pytest.mark.parametrize("data", [np.zeros((4, 4)), np.full((4, 4), np.nan)])
def test_renderer_rejects_images_without_usable_variation(monkeypatch, data):
    monkeypatch.setattr(frames, "_download_render_image", Mock(return_value=(data, WCS())))
    with pytest.raises(ValueError, match="variation|valid pixels"):
        frames._render_png("source")
