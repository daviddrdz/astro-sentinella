import io
from datetime import date

import numpy as np
from astropy.io import fits
from astropy.table import Table
from astropy.time import Time
from matplotlib.figure import Figure

from services.irsa_archive import ArchiveUnavailableError, search_images, with_retries

FIGURE_SIZE_IN = 6
FIGURE_DPI = 340  # 6 in x 340 dpi = 2040 px square


class ImageNotFoundError(Exception):
    pass


def select_image_url_for_date(table: Table, observation_date: date) -> str | None:
    """Return the access URL of the earliest image whose t_min (MJD) falls on the date."""
    if len(table) == 0:
        return None
    day_start = Time(observation_date.isoformat(), scale="utc").mjd
    t_min = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    on_date = np.flatnonzero((t_min >= day_start) & (t_min < day_start + 1))
    if on_date.size == 0:
        return None
    earliest = on_date[np.argmin(t_min[on_date])]
    return str(table["access_url"][earliest])


def _download_image_data(fits_url: str) -> np.ndarray:
    with fits.open(fits_url, memmap=False) as hdul:
        return np.nan_to_num(hdul[1].data, nan=0.0)


def _find_image_url(ra_deg: float, dec_deg: float, observation_date: date) -> str:
    url = select_image_url_for_date(search_images(ra_deg, dec_deg), observation_date)
    if url is None:
        raise ImageNotFoundError(
            f"No image found at these coordinates on {observation_date.isoformat()}."
        )
    return url


def _render_png(fits_url: str) -> bytes:
    try:
        data = with_retries(
            lambda: _download_image_data(fits_url), (OSError,), "Image download"
        )
    except OSError as exc:
        raise ArchiveUnavailableError("Image download failed.") from exc

    fig = Figure(figsize=(FIGURE_SIZE_IN, FIGURE_SIZE_IN), dpi=FIGURE_DPI, facecolor="black")
    ax = fig.add_axes((0, 0, 1, 1))
    ax.imshow(
        data,
        origin="lower",
        cmap="magma",
        vmin=np.percentile(data, 10),
        vmax=np.percentile(data, 99),
    )
    ax.axis("off")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=FIGURE_DPI)
    return buf.getvalue()


def get_sky_image_png(ra_deg: float, dec_deg: float, observation_date: date) -> bytes:
    return _render_png(_find_image_url(ra_deg, dec_deg, observation_date))
