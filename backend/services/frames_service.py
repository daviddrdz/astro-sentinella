from datetime import date
from dataclasses import dataclass

import numpy as np
from astropy.table import Table
from astropy.time import Time
from astropy.utils.data import conf
from astropy.wcs import WCS
from services.cache import TTLCache
from services.fits_remote import RemoteFitsError
from services.image_renderer import _download_fits_image, render_image_png

from services.irsa_archive import ArchiveUnavailableError, search_images

conf.remote_timeout = 120

PNG_CACHE = TTLCache(ttl_s=3600, max_items=32)
# WCS + shape of rendered cutouts, filled as a by-product of rendering so the
# spectrum endpoint never has to re-download a frame just to map a click.
FRAME_GEOMETRY_CACHE = TTLCache(ttl_s=3600, max_items=64)


class ImageNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class FrameGeometry:
    wcs: WCS  # celestial WCS of the rendered cutout
    shape: tuple[int, int]  # (ny, nx) of the rendered cutout


def frame_geometry_key(ra_deg: float, dec_deg: float, observation_date: date, size_deg: float):
    return (round(ra_deg, 5), round(dec_deg, 5), observation_date, size_deg)


def remember_frame_geometry(key, image_data: np.ndarray, wcs: WCS) -> None:
    if wcs.has_celestial:
        geometry = FrameGeometry(wcs.celestial, tuple(int(n) for n in image_data.shape[-2:]))
        FRAME_GEOMETRY_CACHE.get_or_compute(key, lambda: geometry)


def _rows_on_date(table: Table, observation_date: date) -> np.ndarray:
    if len(table) == 0 or "t_min" not in table.colnames:
        return np.array([], dtype=int)
    day_start = Time(observation_date.isoformat(), scale="utc").mjd
    t_min = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    return np.flatnonzero((t_min >= day_start) & (t_min < day_start + 1))


def select_image_url_for_date(table: Table, observation_date: date) -> str | None:
    """Return the access URL of the earliest image whose t_min (MJD) falls on the date."""
    on_date = _rows_on_date(table, observation_date)
    if on_date.size == 0:
        return None
    t_min = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    earliest = on_date[np.argmin(t_min[on_date])]
    return str(table["access_url"][earliest])


def list_frames_for_date(
    ra_deg: float, dec_deg: float, observation_date: date, size_deg: float = 0.05
) -> list[dict]:
    """Return timeline frames matching the frontend ExplorerFrame contract."""
    table = search_images(ra_deg, dec_deg)
    on_date = _rows_on_date(table, observation_date)
    if on_date.size == 0:
        return []

    t_min = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    ordered = on_date[np.argsort(t_min[on_date])]
    times = Time(t_min[ordered], format="mjd", scale="utc").to_datetime()

    frames = []
    for idx, row_idx in enumerate(ordered):
        dt = times[idx]
        frames.append(
            {
                "id": f"spherex-{row_idx}",
                "timestamp": dt.strftime("%H:%MZ"),
                "band": 2,
                "filtered": False,
                "visible": True,
                "imageUrl": (
                    f"/api/frames/image?ra={ra_deg}&dec={dec_deg}"
                    f"&fieldSizeDeg={size_deg}&observationDate={observation_date.isoformat()}"
                ),
            }
        )
    return frames


def _find_image_url(ra_deg: float, dec_deg: float, observation_date: date) -> str:
    url = select_image_url_for_date(search_images(ra_deg, dec_deg), observation_date)
    if url is None:
        raise ImageNotFoundError(
            f"No image found at these coordinates on {observation_date.isoformat()}."
        )
    return url


def _render_png(
    fits_url: str,
    ra_deg: float = 0.0,
    dec_deg: float = 0.0,
    size_deg: float = 0.05,
    color: str = "magma",
    bands: tuple[int, ...] | None = None,
    geometry_key=None,
) -> bytes:
    def load(source):
        image_data, wcs = _download_render_image(source, ra_deg, dec_deg, size_deg)
        if geometry_key is not None:
            remember_frame_geometry(geometry_key, image_data, wcs)
        return image_data, wcs

    try:
        coords = {"ra": ra_deg, "dec": dec_deg}
        if bands:
            coords["sources"] = {band: fits_url for band in bands}
        else:
            coords["source"] = fits_url
        return render_image_png(
            coords,
            color=color,
            bands=bands,
            size=None,
            image_loader=load,
        )
    except (OSError, RemoteFitsError) as exc:
        raise ArchiveUnavailableError("Image download failed.") from exc


def _download_render_image(fits_url, ra_deg, dec_deg, size_deg):
    return _download_fits_image(fits_url, ra_deg, dec_deg, size_deg)


def get_sky_image_png(
    ra_deg,
    dec_deg,
    observation_date,
    size_deg=0.05,
    color="magma",
    bands: tuple[int, ...] | None = None,
) -> bytes:
    key = (round(ra_deg, 5), round(dec_deg, 5), observation_date, size_deg, color, bands)

    def compute():
        fits_url = _find_image_url(ra_deg, dec_deg, observation_date)
        return _render_png(
            fits_url,
            ra_deg,
            dec_deg,
            size_deg,
            color,
            bands,
            geometry_key=frame_geometry_key(ra_deg, dec_deg, observation_date, size_deg),
        )

    return PNG_CACHE.get_or_compute(key, compute)
