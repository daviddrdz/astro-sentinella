"""Build a spectrum at a sky position from every SPHEREx exposure covering it.

Each Level-2 file is one detector exposure whose wavelength varies smoothly
across the detector (linear variable filter), so one exposure contributes one
(wavelength, flux) sample at the requested position. Samples are gathered with
byte-range reads and then binned to the instrument's nominal 17 bands per
detector for plotting.
"""
import logging
import re
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass

import numpy as np
from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS

from services import fits_remote
from services.cache import TTLCache
from services.irsa_archive import search_images

logger = logging.getLogger(__name__)

DETECTORS = (1, 2, 3, 4, 5, 6)
BINS_PER_DETECTOR = 17
MAX_WORKERS = 32
DEADLINE_S = 25.0
CLIP_SIGMA = 3.0
FLUX_UNIT = "MJy/sr"
SOURCE = "SPHEREx DR1 Level-2 exposures (per-observation samples)"
# Archive searches are slow (~20 s), so search on a coarse grid with a radius that
# covers the whole cell; clicks within the same cell then share one cached result.
# 0.05 deg matches the explorer's default field size.
SEARCH_CELL_DEG = 0.05
SEARCH_RADIUS_DEG = 0.05

SPECTRUM_CACHE = TTLCache(ttl_s=3600, max_items=256)
WAVE_GRID_CACHE = TTLCache(ttl_s=24 * 3600, max_items=len(DETECTORS))
WCS_CACHE = TTLCache(ttl_s=6 * 3600, max_items=1024)

_DETECTOR_IN_URL = re.compile(r"D([1-6])_spx")
# Primary celestial WCS cards only (no alternate A/W systems); WCS() on the full
# 293-card header costs ~65 ms of GIL time per exposure, this costs ~10 ms.
_CELESTIAL_CARD = re.compile(
    r"^(NAXIS\d?|WCSAXES|CTYPE\d|CUNIT\d|CRPIX\d|CRVAL\d|CDELT\d|CD\d_\d|PC\d_\d"
    r"|LONPOLE|LATPOLE|RADESYS|EQUINOX|A_ORDER|B_ORDER|AP_ORDER|BP_ORDER|[AB]P?_\d+_\d+)$"
)


class NoCoverageError(Exception):
    pass


class _PartialResult(Exception):
    """Carries a partial payload out of the cache so it is returned but not stored."""


@dataclass(frozen=True)
class Exposure:
    url: str
    obs_id: str
    mjd: float
    detector: int


@dataclass(frozen=True)
class WaveGrid:
    """Per-detector lookup table of (wavelength, bandwidth) at 1-based raw pixel coords."""

    x: np.ndarray
    y: np.ndarray
    values: np.ndarray  # shape (ny, nx, 2)

    def at(self, raw_x: float, raw_y: float) -> tuple[float, float]:
        ix = int(np.clip(np.searchsorted(self.x, raw_x) - 1, 0, len(self.x) - 2))
        iy = int(np.clip(np.searchsorted(self.y, raw_y) - 1, 0, len(self.y) - 2))
        tx = (raw_x - self.x[ix]) / (self.x[ix + 1] - self.x[ix])
        ty = (raw_y - self.y[iy]) / (self.y[iy + 1] - self.y[iy])
        v = self.values
        row0 = v[iy, ix] * (1 - tx) + v[iy, ix + 1] * tx
        row1 = v[iy + 1, ix] * (1 - tx) + v[iy + 1, ix + 1] * tx
        wave, bw = row0 * (1 - ty) + row1 * ty
        return float(wave), float(bw)

    @property
    def wavelength_range(self) -> tuple[float, float]:
        waves = self.values[..., 0]
        return float(waves.min()), float(waves.max())


@dataclass(frozen=True)
class Sample:
    wavelength: float
    bandwidth: float
    flux: float
    error: float
    zodi: float
    detector: int
    obs_id: str
    mjd: float
    detector_range: tuple[float, float]


def _detector_of(row) -> int | None:
    name = str(row["energy_bandpassname"]) if "energy_bandpassname" in row.colnames else ""
    match = re.search(r"D([1-6])", name) or _DETECTOR_IN_URL.search(str(row["access_url"]))
    return int(match.group(1)) if match else None


def exposures_from_table(table: Table, detectors: tuple[int, ...] = ()) -> list[Exposure]:
    seen: set[str] = set()
    exposures = []
    for row in table:
        url = str(row["access_url"])
        detector = _detector_of(row)
        if url in seen or detector is None or (detectors and detector not in detectors):
            continue
        seen.add(url)
        mjd = float(np.ma.filled(row["t_min"], np.nan)) if "t_min" in table.colnames else float("nan")
        obs_id = str(row["obs_id"]) if "obs_id" in table.colnames else url.rsplit("/", 1)[-1]
        exposures.append(Exposure(url, obs_id, mjd, detector))
    return exposures


def _load_wave_grid(url: str, layout: list[fits_remote.HduInfo]) -> WaveGrid:
    table = fits_remote.read_table(url, fits_remote.find_hdu(layout, "WCS-WAVE"))
    row = table.data[0]
    return WaveGrid(
        np.asarray(row["X"], dtype=float),
        np.asarray(row["Y"], dtype=float),
        np.asarray(row["VALUES"], dtype=float),
    )


def _raw_pixel(header, col: int, row: int) -> tuple[float, float]:
    """Map 0-based image pixel to the lookup table's raw detector coordinate (WCS key W)."""
    def axis(n, p):
        return (p - header.get(f"CRPIX{n}W", 1.0)) * header.get(f"CDELT{n}W", 1.0) + header.get(
            f"CRVAL{n}W", 1.0
        )

    return axis(1, col + 1), axis(2, row + 1)


def _window_mean(values: np.ndarray) -> float:
    finite = values[np.isfinite(values)]
    return float(finite.mean()) if finite.size else float("nan")


def _celestial_wcs(url: str, header: fits.Header) -> WCS:
    def build():
        cards = [card for card in header.cards if _CELESTIAL_CARD.match(card.keyword)]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return WCS(fits.Header(cards), fix=False)

    return WCS_CACHE.get_or_compute(url, build)


def sample_exposure(exposure: Exposure, ra_deg: float, dec_deg: float, aperture_px: int) -> Sample | None:
    """Return the (wavelength, flux) sample at the position, or None if it falls off the detector."""
    url = fits_remote.s3_url(exposure.url)
    layout = fits_remote.hdu_layout(url)
    image = fits_remote.find_hdu(layout, "IMAGE")
    header = image.header

    wcs = _celestial_wcs(url, header)
    x, y = wcs.all_world2pix([[ra_deg, dec_deg]], 0, quiet=True)[0]
    col, row = int(round(float(x))), int(round(float(y)))
    half = aperture_px // 2
    width, height = header["NAXIS1"], header["NAXIS2"]
    if not (half <= col < width - half and half <= row < height - half):
        return None

    window = (row - half, row + half, col - half, col + half)
    flux = fits_remote.read_image_window(url, image, *window)
    variance = fits_remote.read_image_window(url, fits_remote.find_hdu(layout, "VARIANCE"), *window)
    zodi = fits_remote.read_image_window(url, fits_remote.find_hdu(layout, "ZODI"), *window)

    grid = WAVE_GRID_CACHE.get_or_compute(exposure.detector, lambda: _load_wave_grid(url, layout))
    wavelength, bandwidth = grid.at(*_raw_pixel(header, col, row))

    n_valid = int(np.isfinite(flux).sum())
    error = float(np.sqrt(np.nansum(variance)) / n_valid) if n_valid else float("nan")
    return Sample(
        wavelength,
        bandwidth,
        _window_mean(flux - zodi),
        error,
        _window_mean(zodi),
        exposure.detector,
        exposure.obs_id,
        exposure.mjd,
        grid.wavelength_range,
    )


def _sigma_clip(flux: np.ndarray) -> np.ndarray:
    if flux.size < 3:
        return np.ones(flux.size, dtype=bool)
    median = np.median(flux)
    sigma = 1.4826 * np.median(np.abs(flux - median))
    if sigma == 0:
        return np.ones(flux.size, dtype=bool)
    return np.abs(flux - median) <= CLIP_SIGMA * sigma


def bin_samples(samples: list[Sample], ranges: dict[int, tuple[float, float]]) -> list[dict]:
    """Inverse-variance weighted mean per nominal band, with sigma clipping."""
    binned = []
    for detector, (lo, hi) in sorted(ranges.items()):
        members = [s for s in samples if s.detector == detector and np.isfinite(s.flux)]
        if not members:
            continue
        edges = np.geomspace(lo, hi, BINS_PER_DETECTOR + 1)
        wave = np.array([s.wavelength for s in members])
        flux = np.array([s.flux for s in members])
        err = np.array([s.error for s in members])
        idx = np.clip(np.searchsorted(edges, wave, side="right") - 1, 0, BINS_PER_DETECTOR - 1)
        for b in range(BINS_PER_DETECTOR):
            mask = idx == b
            if not mask.any():
                continue
            keep = _sigma_clip(flux[mask])
            f, e, w = flux[mask][keep], err[mask][keep], wave[mask][keep]
            weights = np.where(np.isfinite(e) & (e > 0), 1.0 / np.square(e), np.nan)
            if not np.isfinite(weights).all():
                weights = np.ones_like(f)
            total = weights.sum()
            binned.append(
                {
                    "wavelengthUm": float((w * weights).sum() / total),
                    "wavelengthMinUm": float(edges[b]),
                    "wavelengthMaxUm": float(edges[b + 1]),
                    "flux": float((f * weights).sum() / total),
                    "error": float(np.sqrt(1.0 / total)) if np.isfinite(e).all() and (e > 0).all() else None,
                    "detector": detector,
                    "n": int(keep.sum()),
                }
            )
    return binned


def _float_or_none(value: float) -> float | None:
    return float(value) if np.isfinite(value) else None


def _point(sample: Sample) -> dict:
    return {
        "wavelengthUm": sample.wavelength,
        "bandwidthUm": sample.bandwidth,
        "flux": _float_or_none(sample.flux),
        "error": _float_or_none(sample.error),
        "zodi": _float_or_none(sample.zodi),
        "detector": sample.detector,
        "obsId": sample.obs_id,
        "mjd": _float_or_none(sample.mjd),
    }


def _gather(exposures: list[Exposure], ra_deg: float, dec_deg: float, aperture_px: int) -> dict:
    samples: list[Sample] = []
    failed = out_of_bounds = 0
    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    try:
        futures = [
            executor.submit(sample_exposure, exposure, ra_deg, dec_deg, aperture_px)
            for exposure in exposures
        ]
        done, pending = wait(futures, timeout=DEADLINE_S)
        for future in pending:
            future.cancel()
        for future in done:
            try:
                sample = future.result()
            except Exception:
                logger.warning("Spectrum sample failed", exc_info=True)
                failed += 1
                continue
            if sample is None:
                out_of_bounds += 1
            else:
                samples.append(sample)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    timed_out = len(pending)
    samples.sort(key=lambda s: s.wavelength)
    ranges = {s.detector: s.detector_range for s in samples}
    return {
        "points": [_point(s) for s in samples],
        "binned": bin_samples(samples, ranges),
        "coverage": {
            "exposures": len(exposures),
            "used": len(samples),
            "outOfBounds": out_of_bounds,
            "failed": failed,
            "timedOut": timed_out,
            "detectors": sorted(ranges),
        },
        "status": "complete" if not (failed or timed_out) else "partial",
    }


def _search_exposures(ra_deg: float, dec_deg: float, detectors: tuple[int, ...]) -> list[Exposure]:
    cell_ra = round(ra_deg / SEARCH_CELL_DEG) * SEARCH_CELL_DEG
    cell_dec = round(dec_deg / SEARCH_CELL_DEG) * SEARCH_CELL_DEG
    return exposures_from_table(search_images(cell_ra, cell_dec, SEARCH_RADIUS_DEG), detectors)


def extract_spectrum(
    ra_deg: float, dec_deg: float, aperture_px: int = 1, detectors: tuple[int, ...] = ()
) -> dict:
    key = (round(ra_deg, 4), round(dec_deg, 4), aperture_px, detectors)

    def compute():
        started = time.monotonic()
        exposures = _search_exposures(ra_deg, dec_deg, detectors)
        if not exposures:
            raise NoCoverageError("No SPHEREx exposures cover these coordinates.")
        result = _gather(exposures, ra_deg, dec_deg, aperture_px)
        logger.info(
            "Spectrum at (%.4f, %.4f): %d/%d samples in %.1fs",
            ra_deg, dec_deg, result["coverage"]["used"], len(exposures), time.monotonic() - started,
        )
        payload = {
            "position": {"ra": ra_deg, "dec": dec_deg},
            "aperturePx": aperture_px,
            "unit": FLUX_UNIT,
            "source": SOURCE,
            **result,
        }
        if payload["status"] != "complete":
            raise _PartialResult(payload)
        return payload

    try:
        return SPECTRUM_CACHE.get_or_compute(key, compute)
    except _PartialResult as partial:
        return partial.args[0]
