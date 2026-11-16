"""Quick-look spectrum (flux vs wavelength) for one chunk of the rendered frame.

The frame the user sees is a single SPHEREx L2 cutout in detector orientation,
so a chunk is defined in that image: a click (x, y as fractions of the image)
selects a cell of an invisible grid whose cells are ~CHUNK_ARCSEC on a side.
The chunk's corners go through the frame's WCS to the sky, and from the sky
into the SPHEREx DR1 HiPS cube (102 channels, all-mission mosaic), where the
pixels inside the chunk are averaged per channel.

The HiPS cube is meant for visualization; for science use the IRSA SPHEREx
spectrophotometry tool.
"""

import math
import os
import warnings
from dataclasses import dataclass
from datetime import date

import numpy as np
import requests
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from matplotlib.path import Path

from services import hips_cube
from services.cache import TTLCache
from services.frames_service import _find_image_url
from services.image_renderer import _download_fits_image
from services.irsa_archive import ArchiveUnavailableError

CHUNK_ARCSEC = float(os.environ.get("SPECTRUM_CHUNK_ARCSEC", "26"))  # ~2 HiPS cube pixels
MAX_GRID = 32
SPECTRUM_SOURCE = "SPHEREx DR1 HiPS cube (all-mission mosaic, quick-look)"

FRAME_GEOMETRY_CACHE = TTLCache(ttl_s=3600, max_items=64)
FIELD_CUBE_CACHE = TTLCache(ttl_s=3600, max_items=16)


class SpectrumUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class FrameGeometry:
    wcs: WCS  # celestial WCS of the rendered cutout
    shape: tuple[int, int]  # (ny, nx) of the rendered cutout


@dataclass(frozen=True)
class ChunkGrid:
    rows: int
    cols: int
    chunk_arcsec: float


def get_frame_geometry(
    ra_deg: float, dec_deg: float, observation_date: date, size_deg: float
) -> FrameGeometry:
    """WCS and shape of the same cutout that /api/frames/image renders."""

    def compute():
        fits_url = _find_image_url(ra_deg, dec_deg, observation_date)
        try:
            data, wcs = _download_fits_image(fits_url, ra_deg, dec_deg, size_deg)
        except OSError as exc:
            raise ArchiveUnavailableError("Image download failed.") from exc
        if not wcs.has_celestial:
            raise SpectrumUnavailableError("The frame has no sky coordinates.")
        return FrameGeometry(wcs.celestial, tuple(int(n) for n in data.shape[-2:]))

    key = (round(ra_deg, 5), round(dec_deg, 5), observation_date, size_deg)
    return FRAME_GEOMETRY_CACHE.get_or_compute(key, compute)


def get_field_cube(ra_deg: float, dec_deg: float, size_deg: float) -> hips_cube.FieldCube:
    # A rotated square of side s fits in a circle of radius s/sqrt(2); add margin.
    half_size_deg = size_deg * 0.75

    def compute():
        try:
            return hips_cube.load_field_cube(ra_deg, dec_deg, half_size_deg)
        except hips_cube.OutsideTileError as exc:
            raise SpectrumUnavailableError("No SPHEREx mosaic tile covers this field.") from exc
        except (OSError, requests.RequestException) as exc:
            raise ArchiveUnavailableError("Spectral cube download failed.") from exc

    key = (round(ra_deg, 5), round(dec_deg, 5), size_deg)
    return FIELD_CUBE_CACHE.get_or_compute(key, compute)


def chunk_grid(geometry: FrameGeometry, chunk_arcsec: float = CHUNK_ARCSEC) -> ChunkGrid:
    ny, nx = geometry.shape
    sx, sy = (float(s) * 3600 for s in proj_plane_pixel_scales(geometry.wcs))
    cols = min(MAX_GRID, max(1, round(nx * sx / chunk_arcsec)))
    rows = min(MAX_GRID, max(1, round(ny * sy / chunk_arcsec)))
    return ChunkGrid(rows, cols, (nx * sx / cols + ny * sy / rows) / 2)


def chunk_at(x: float, y: float, grid: ChunkGrid) -> tuple[int, int]:
    """(row, col) of the chunk under a click; row 0 is the top of the image."""
    return min(int(y * grid.rows), grid.rows - 1), min(int(x * grid.cols), grid.cols - 1)


def chunk_corners_pixels(
    row: int, col: int, grid: ChunkGrid, shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """Chunk corners in 0-based FITS pixels of the cutout.

    The PNG is drawn with origin="lower" over [-0.5, n - 0.5], so the top of the
    image is FITS y = ny - 0.5.
    """
    ny, nx = shape
    left = -0.5 + col * nx / grid.cols
    right = -0.5 + (col + 1) * nx / grid.cols
    top = ny - 0.5 - row * ny / grid.rows
    bottom = ny - 0.5 - (row + 1) * ny / grid.rows
    return np.array([left, right, right, left]), np.array([top, top, bottom, bottom])


def _chunk_pixel_mask(cube: hips_cube.FieldCube, corners_sky, center_sky) -> np.ndarray:
    _, ny, nx = cube.data.shape
    cx, cy = cube.wcs.world_to_pixel(corners_sky)
    polygon = Path(np.column_stack([cx, cy]))
    yy, xx = np.mgrid[0:ny, 0:nx]
    mask = polygon.contains_points(np.column_stack([xx.ravel(), yy.ravel()])).reshape(ny, nx)
    if mask.any():
        return mask

    # Chunk smaller than a cube pixel: use the pixel under its center.
    px, py = (float(v) for v in cube.wcs.world_to_pixel(center_sky))
    ix, iy = round(px), round(py)
    if not (math.isfinite(px) and math.isfinite(py) and 0 <= ix < nx and 0 <= iy < ny):
        raise SpectrumUnavailableError("This chunk falls outside the spectral cube.")
    mask[iy, ix] = True
    return mask


def chunk_spectrum(
    ra_deg: float, dec_deg: float, observation_date: date, size_deg: float, x: float, y: float
) -> dict:
    geometry = get_frame_geometry(ra_deg, dec_deg, observation_date, size_deg)
    grid = chunk_grid(geometry)
    row, col = chunk_at(x, y, grid)

    xs, ys = chunk_corners_pixels(row, col, grid, geometry.shape)
    corners_sky = geometry.wcs.pixel_to_world(xs, ys)
    center_sky = geometry.wcs.pixel_to_world(xs.mean(), ys.mean())

    cube = get_field_cube(ra_deg, dec_deg, size_deg)
    mask = _chunk_pixel_mask(cube, corners_sky, center_sky)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN channels -> NaN
        flux = np.nanmean(cube.data[:, mask], axis=1)
    if not np.isfinite(flux).any():
        raise SpectrumUnavailableError("The SPHEREx mosaic has no coverage for this chunk.")

    order = np.argsort(cube.wavelength_um)
    points = [
        {
            "wavelengthUm": round(float(cube.wavelength_um[i]), 5),
            "bandwidthUm": round(float(cube.bandwidth_um[i]), 5),
            "flux": float(flux[i]) if np.isfinite(flux[i]) else None,
        }
        for i in order
    ]
    return {
        "chunk": {
            "row": row,
            "col": col,
            "rows": grid.rows,
            "cols": grid.cols,
            "sizeArcsec": round(grid.chunk_arcsec, 2),
            "bounds": {
                "left": col / grid.cols,
                "top": row / grid.rows,
                "width": 1 / grid.cols,
                "height": 1 / grid.rows,
            },
        },
        "center": {
            "ra": round(float(center_sky.ra.deg), 6),
            "dec": round(float(center_sky.dec.deg), 6),
        },
        "pixelCount": int(mask.sum()),
        "unit": cube.unit,
        "source": SPECTRUM_SOURCE,
        "points": points,
    }
