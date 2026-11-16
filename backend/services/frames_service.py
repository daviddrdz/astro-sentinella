from datetime import date
import logging

import numpy as np
from astropy.table import Table
from astropy.time import Time
from astropy.utils.data import conf
from services.cache import TTLCache
from services.image_renderer import _download_fits_image, render_image_png

from services.irsa_archive import ArchiveUnavailableError, search_images

conf.remote_timeout = 120
logger = logging.getLogger(__name__)

PNG_CACHE = TTLCache(ttl_s=3600, max_items=32)
FITS_CACHE = TTLCache(ttl_s=3600, max_items=32)

DETECTOR_WAVELENGTHS_UM = {
    1: (0.75, 1.11),
    2: (1.11, 1.66),
    3: (1.64, 2.42),
    4: (2.42, 3.18),
    5: (3.18, 4.41),
    6: (4.41, 5.00),
}


class ImageNotFoundError(Exception):
    pass


def _rows_on_date(table: Table, observation_date: date) -> np.ndarray:
    if len(table) == 0 or "t_min" not in table.colnames:
        return np.array([], dtype=int)
    day_start = Time(observation_date.isoformat(), scale="utc").mjd
    t_min = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    return np.flatnonzero((t_min >= day_start) & (t_min < day_start + 1))


def _detector_number(value: object) -> int | None:
    if isinstance(value, (int, np.integer)) and int(value) in DETECTOR_WAVELENGTHS_UM:
        return int(value)
    text = str(value).strip().upper()
    for detector in DETECTOR_WAVELENGTHS_UM:
        if f"D{detector}" in text or f"DETECTOR{detector}" in text:
            return detector
    return None


def _detector_for_row(table: Table, row_idx: int) -> int | None:
    for column in (
        "energy_bandpassname",
        "detector",
        "detector_id",
        "band",
        "access_url",
    ):
        if column in table.colnames:
            detector = _detector_number(table[column][row_idx])
            if detector is not None:
                return detector
    return None


def available_detectors_for_date(table: Table, observation_date: date) -> list[dict]:
    """Return detector metadata for the selected date, without downloading FITS files."""
    on_date = _rows_on_date(table, observation_date)
    detectors = sorted(
        {_detector_for_row(table, int(row_idx)) for row_idx in on_date} - {None}
    )
    return [
        {
            "detector": detector,
            "wavelengthMinUm": DETECTOR_WAVELENGTHS_UM[detector][0],
            "wavelengthMaxUm": DETECTOR_WAVELENGTHS_UM[detector][1],
        }
        for detector in detectors
    ]


def _rows_for_detector(
    table: Table, observation_date: date, detector: int | None
) -> np.ndarray:
    on_date = _rows_on_date(table, observation_date)
    if on_date.size == 0:
        return on_date
    if detector is None:
        return on_date
    return np.array(
        [row_idx for row_idx in on_date if _detector_for_row(table, int(row_idx)) == detector],
        dtype=int,
    )


def select_image_url_for_date(
    table: Table, observation_date: date, detector: int | None = None
) -> str | None:
    """Return the earliest detector file for a date, defaulting to the first detector."""
    if detector is None:
        available = available_detectors_for_date(table, observation_date)
        detector = available[0]["detector"] if available else None
    on_date = _rows_for_detector(table, observation_date, detector)
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
    frames = []
    for detector_info in available_detectors_for_date(table, observation_date):
        detector = detector_info["detector"]
        detector_rows = _rows_for_detector(table, observation_date, detector)
        if detector_rows.size == 0:
            continue
        row_idx = detector_rows[np.argmin(t_min[detector_rows])]
        dt = Time(t_min[row_idx], format="mjd", scale="utc").to_datetime()
        frames.append(
            {
                "id": f"spherex-{row_idx}-d{detector}",
                "timestamp": dt.strftime("%H:%MZ"),
                "band": detector,
                "detector": detector,
                **detector_info,
                "filtered": False,
                "visible": True,
                "imageUrl": (
                    f"/api/frames/image?ra={ra_deg}&dec={dec_deg}"
                    f"&fieldSizeDeg={size_deg}&observationDate={observation_date.isoformat()}"
                    f"&detector={detector}"
                ),
            }
        )
    return frames


def _find_image_url(
    ra_deg: float, dec_deg: float, observation_date: date, detector: int | None = None
) -> str:
    url = select_image_url_for_date(
        search_images(ra_deg, dec_deg), observation_date, detector
    )
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
) -> bytes:
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
            image_loader=lambda source: _download_render_image(
                source, ra_deg, dec_deg, size_deg
            ),
        )
    except OSError as exc:
        raise ArchiveUnavailableError("Image download failed.") from exc


def _download_render_image(fits_url, ra_deg, dec_deg, size_deg):
    key = (fits_url, round(ra_deg, 5), round(dec_deg, 5), size_deg)
    return FITS_CACHE.get_or_compute(
        key, lambda: _download_fits_image(fits_url, ra_deg, dec_deg, size_deg)
    )


def get_sky_image_png(
    ra_deg,
    dec_deg,
    observation_date,
    size_deg=0.05,
    color="magma",
    bands: tuple[int, ...] | None = None,
    detectors: tuple[int, ...] | None = None,
) -> bytes:
    requested_detectors = detectors if detectors is not None else bands
    key = (
        round(ra_deg, 5), round(dec_deg, 5), observation_date, size_deg, color,
        requested_detectors,
    )

    def compute():
        table = search_images(ra_deg, dec_deg)
        selected_detectors = requested_detectors
        if detectors is None and len(requested_detectors or ()) == 1:
            available = available_detectors_for_date(table, observation_date)
            if available:
                selected_detectors = (available[0]["detector"],)
                if selected_detectors[0] != requested_detectors[0]:
                    logger.info(
                        "Ignoring legacy band %d on %s; using first detector %d.",
                        requested_detectors[0],
                        observation_date.isoformat(),
                        selected_detectors[0],
                    )
        if selected_detectors:
            sources = {
                detector: select_image_url_for_date(table, observation_date, detector)
                for detector in selected_detectors
            }
            if any(url is None for url in sources.values()):
                raise ImageNotFoundError(
                    f"No requested detector image found on {observation_date.isoformat()}."
                )
            coords = {"ra": ra_deg, "dec": dec_deg, "sources": sources}
            try:
                return render_image_png(
                    coords,
                    color=color,
                    bands=selected_detectors,
                    size=None,
                    image_loader=lambda source: _download_render_image(
                        source, ra_deg, dec_deg, size_deg
                    ),
                )
            except OSError as exc:
                raise ArchiveUnavailableError("Image download failed.") from exc
        fits_url = _find_image_url(ra_deg, dec_deg, observation_date)
        return _render_png(fits_url, ra_deg, dec_deg, size_deg, color)

    return PNG_CACHE.get_or_compute(key, compute)
