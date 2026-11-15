import io
from datetime import date

import numpy as np
from astropy.io import fits
from astropy.table import Table
from astropy.time import Time
from astropy.utils.data import conf
from astropy.visualization import AsymmetricPercentileInterval, AsinhStretch, ImageNormalize
from matplotlib.figure import Figure
from services.cache import TTLCache

from services.irsa_archive import ArchiveUnavailableError, search_images, with_retries

conf.remote_timeout = 120

FIGURE_SIZE_IN = 6
FIGURE_DPI = 100

# Bits de artefactos severos en FLAGS (SPHEREx Explanatory Supplement, Tabla 16)
BAD_PIXEL_MASK = (
    (1 << 0)   # TRANSIENT
    | (1 << 1)   # OVERFLOW
    | (1 << 2)   # SUR_ERROR
    | (1 << 6)   # NONFUNC
    | (1 << 9)   # MISSING_DATA
    | (1 << 10)  # HOT
    | (1 << 11)  # COLD
    | (1 << 27)  # SNOWBALL
)

PNG_CACHE = TTLCache(ttl_s=3600, max_items=32)


class ImageNotFoundError(Exception):
    pass


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
                "band": "IR",
                "filtered": False,
                "visible": True,
                "imageUrl": (
                    f"/api/frames/image?ra={ra_deg}&dec={dec_deg}"
                    f"&fieldSizeDeg={size_deg}&observationDate={observation_date.isoformat()}"
                ),
            }
        )
    return frames


def _build_cutout_url(fits_url: str, ra_deg: float, dec_deg: float, size_deg: float) -> str:
    if not fits_url.startswith(("http://", "https://")):
        return fits_url
    sep = "&" if "?" in fits_url else "?"
    return f"{fits_url}{sep}center={ra_deg},{dec_deg}d&size={size_deg}d"


def _download_image_data(
    fits_url: str,
    ra_deg: float = 0.0,
    dec_deg: float = 0.0,
    size_deg: float = 0.05,
    subtract_zodi: bool = True,
    mask_bad_pixels: bool = True,
) -> np.ndarray:
    target = _build_cutout_url(fits_url, ra_deg, dec_deg, size_deg)
    with fits.open(target, memmap=False, cache=False) as hdul:
        ext = "IMAGE" if "IMAGE" in hdul else 1
        image_data = np.array(hdul[ext].data, dtype=np.float32)

        if subtract_zodi and "ZODI" in hdul:
            zodi_data = np.array(hdul["ZODI"].data, dtype=np.float32)
            image_data = image_data - zodi_data

        if mask_bad_pixels and "FLAGS" in hdul:
            flags_data = np.asarray(hdul["FLAGS"].data, dtype=np.uint32)
            image_data[(flags_data & BAD_PIXEL_MASK) != 0] = np.nan

    finite = np.isfinite(image_data)
    if not np.any(finite):
        return np.zeros_like(image_data, dtype=np.float32)

    median_val = float(np.nanmedian(image_data[finite]))
    return np.nan_to_num(image_data, nan=median_val)


def _find_image_url(ra_deg: float, dec_deg: float, observation_date: date) -> str:
    url = select_image_url_for_date(search_images(ra_deg, dec_deg), observation_date)
    if url is None:
        raise ImageNotFoundError(
            f"No image found at these coordinates on {observation_date.isoformat()}."
        )
    return url


def _render_png(
    fits_url: str, ra_deg: float = 0.0, dec_deg: float = 0.0, size_deg: float = 0.05
) -> bytes:
    try:
        data = with_retries(
            lambda: _download_image_data(fits_url, ra_deg, dec_deg, size_deg),
            (OSError,),
            "Image download",
        )
    except OSError as exc:
        raise ArchiveUnavailableError("Image download failed.") from exc

    if np.nanmin(data) == np.nanmax(data):
        scaled = np.zeros_like(data, dtype=np.float32)
    else:
        norm = ImageNormalize(
            data,
            interval=AsymmetricPercentileInterval(1.0, 99.5),
            stretch=AsinhStretch(a=0.05),
        )
        scaled = np.clip(norm(data), 0.0, 1.0)

    fig = Figure(figsize=(FIGURE_SIZE_IN, FIGURE_SIZE_IN), dpi=FIGURE_DPI, facecolor="black")
    ax = fig.add_axes((0, 0, 1, 1))
    ax.imshow(scaled, origin="lower", cmap="magma", vmin=0.0, vmax=1.0)
    ax.axis("off")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=FIGURE_DPI)
    return buf.getvalue()


def get_sky_image_png(ra_deg, dec_deg, observation_date, size_deg=0.05) -> bytes:
    key = (round(ra_deg, 5), round(dec_deg, 5), observation_date, size_deg)

    def compute():
        fits_url = _find_image_url(ra_deg, dec_deg, observation_date)
        return _render_png(fits_url, ra_deg, dec_deg, size_deg)

    return PNG_CACHE.get_or_compute(key, compute)
