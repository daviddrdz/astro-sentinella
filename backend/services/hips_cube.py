"""Read small sky regions out of the SPHEREx DR1 HiPS FITS cubes.

Each HEALPix order-5 tile is a ~300 MB MEF file whose IMAGE extension is a
102 x 512 x 512 cube (MJy/sr, 12.9"/px, HPX projection). A chunk spectrum only
needs a few dozen pixels, so instead of downloading the whole tile we walk the
FITS headers and fetch just the rows we need from every layer with HTTP Range
requests, in parallel. If the server ignores Range, we fall back to downloading
the tile once into astropy's on-disk cache and reading it locally.
"""

import io
import math
import os
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import astropy.units as u
import hpgeom
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.table import Table
from astropy.utils.data import download_file
from astropy.wcs import WCS

from services import fits_remote
from services.cache import TTLCache
from services.fits_remote import RangeNotSupportedError

# The public S3 mirror of the IRSA archive: same keys, supports Range, and avoids
# the IRSA proxy's sporadic 403/502s.
HIPS_CUBE_DATA_URL = os.environ.get(
    "SPHEREX_HIPS_CUBE_URL",
    "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/dr1/hips5_cube/hips_20261026",
)
HIPS_ORDER = 5
FITS_BLOCK = 2880
CARD = 80
HEADER_PROBE_BYTES = 10 * FITS_BLOCK
MAX_HDUS = 16
MAX_PARALLEL_RANGES = 16
HTTP_TIMEOUT_S = 60
# One order-5 tile (~1.8 deg) serves many explorer fields; its header layout never changes.
SCAN_CACHE = TTLCache(ttl_s=6 * 3600, max_items=256)

_BITPIX_DTYPES = {8: ">u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}
_CELESTIAL_EXTRA_KEYS = ("LONPOLE", "LATPOLE", "RADESYS", "EQUINOX", "MJD-OBS", "DATE-OBS")

# (url, first_byte, last_byte_inclusive) -> bytes
RangeFetcher = Callable[[str, int, int], bytes]


class OutsideTileError(Exception):
    pass


@dataclass(frozen=True)
class HduInfo:
    header: fits.Header
    header_offset: int
    data_offset: int
    raw_header: bytes


@dataclass(frozen=True)
class FieldCube:
    data: np.ndarray  # (n_channels, ny, nx), MJy/sr, NaN where there is no coverage
    wcs: WCS  # 2D celestial WCS of ``data``'s spatial axes
    wavelength_um: np.ndarray
    bandwidth_um: np.ndarray
    unit: str


def tile_url(ra_deg: float, dec_deg: float, order: int = HIPS_ORDER) -> str:
    ipix = int(hpgeom.angle_to_pixel(2**order, ra_deg, dec_deg, nest=True, lonlat=True))
    dir_id = (ipix // 10000) * 10000
    return f"{HIPS_CUBE_DATA_URL}/Norder{order}/Dir{dir_id}/Npix{ipix}_cube.fits"


def http_range_fetch(url: str, start: int, end: int) -> bytes:
    """Pooled, retrying range read; raises RangeNotSupportedError on a 200 reply."""
    return fits_remote.read_range(url, start, end)


def file_range_fetch(url: str, start: int, end: int) -> bytes:
    with open(url, "rb") as fh:
        fh.seek(start)
        return fh.read(end - start + 1)


def _read_header(url: str, fetch: RangeFetcher, offset: int) -> tuple[fits.Header, bytes]:
    buf = b""
    while True:
        chunk = fetch(url, offset + len(buf), offset + len(buf) + HEADER_PROBE_BYTES - 1)
        if not chunk:
            raise OSError("Unexpected end of FITS file while reading a header.")
        scan_from = (len(buf) // CARD) * CARD
        buf += chunk
        for pos in range(scan_from, len(buf) - CARD + 1, CARD):
            card = buf[pos : pos + CARD]
            if card[:3] == b"END" and not card[3:].strip():
                header_len = math.ceil((pos + CARD) / FITS_BLOCK) * FITS_BLOCK
                raw = buf[:header_len]
                return fits.Header.fromstring(raw[: pos + CARD].decode("ascii")), raw


def _data_size(header: fits.Header) -> int:
    naxis = int(header.get("NAXIS", 0))
    if naxis == 0:
        return 0
    elements = math.prod(int(header[f"NAXIS{i}"]) for i in range(1, naxis + 1))
    size = abs(int(header["BITPIX"])) // 8 * int(header.get("GCOUNT", 1)) * (
        int(header.get("PCOUNT", 0)) + elements
    )
    return math.ceil(size / FITS_BLOCK) * FITS_BLOCK


def scan_hdus(url: str, fetch: RangeFetcher, wanted: set[str]) -> dict[str, HduInfo]:
    """Walk the MEF headers (skipping data) until every extension in ``wanted`` is found."""

    def compute():
        found: dict[str, HduInfo] = {}
        offset = 0
        for index in range(MAX_HDUS):
            header, raw = _read_header(url, fetch, offset)
            name = str(header.get("EXTNAME", "PRIMARY" if index == 0 else "")).strip().upper()
            data_offset = offset + len(raw)
            if name in wanted:
                found[name] = HduInfo(header, offset, data_offset, raw)
                if wanted <= found.keys():
                    return found
            offset = data_offset + _data_size(header)
        raise OSError(f"FITS file is missing extensions: {sorted(wanted - found.keys())}")

    return SCAN_CACHE.get_or_compute((url, frozenset(wanted)), compute)


def read_cube_rows(
    url: str, fetch: RangeFetcher, info: HduInfo, y0: int, y1: int, x0: int, x1: int
) -> np.ndarray:
    """Return ``cube[:, y0:y1, x0:x1]`` reading one contiguous byte range per layer."""
    hdr = info.header
    nx, ny, nz = int(hdr["NAXIS1"]), int(hdr["NAXIS2"]), int(hdr["NAXIS3"])
    dtype = np.dtype(_BITPIX_DTYPES[int(hdr["BITPIX"])])
    row_bytes = nx * dtype.itemsize
    nrows = y1 - y0

    def fetch_layer(k: int) -> np.ndarray:
        start = info.data_offset + (k * ny + y0) * row_bytes
        raw = fetch(url, start, start + nrows * row_bytes - 1)
        if len(raw) != nrows * row_bytes:
            raise OSError("Short read from the HiPS cube.")
        return np.frombuffer(raw, dtype=dtype).reshape(nrows, nx)[:, x0:x1]

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_RANGES) as pool:
        layers = list(pool.map(fetch_layer, range(nz)))
    cube = np.stack(layers).astype(np.float32)
    bscale, bzero = float(hdr.get("BSCALE", 1.0)), float(hdr.get("BZERO", 0.0))
    if bscale != 1.0 or bzero != 0.0:
        cube = cube * bscale + bzero
    return cube


def read_table(url: str, fetch: RangeFetcher, info: HduInfo) -> Table:
    size = _data_size(info.header)
    data = fetch(url, info.data_offset, info.data_offset + size - 1) if size else b""
    primary = io.BytesIO()
    fits.PrimaryHDU().writeto(primary)
    with fits.open(io.BytesIO(primary.getvalue() + info.raw_header + data)) as hdul:
        return Table(hdul[1].data)


def celestial_wcs(header: fits.Header) -> WCS:
    """2D sky WCS from a cube header, ignoring the -TAB spectral axes (no fobj needed)."""
    out = fits.Header()
    out["NAXIS"] = 2
    for key in header:
        if re.fullmatch(r"(CTYPE|CRPIX|CRVAL|CDELT|CUNIT|NAXIS)[12]", key) or re.fullmatch(
            r"(PC|CD)[12]_[12]|PV[12]_\d+", key
        ):
            out[key] = header[key]
    for key in _CELESTIAL_EXTRA_KEYS:
        if key in header:
            out[key] = header[key]
    return WCS(out)


def local_pixel_scale_deg(wcs: WCS, x: float, y: float) -> float:
    """sqrt of the on-sky solid angle of one pixel; correct for HPX, which is not to scale."""
    c0, c1, c2 = wcs.pixel_to_world([x, x + 1, x], [y, y, y + 1])
    dlon1, dlat1 = c0.spherical_offsets_to(c1)
    dlon2, dlat2 = c0.spherical_offsets_to(c2)
    area = np.abs(dlon1.deg * dlat2.deg - dlat1.deg * dlon2.deg)
    return float(np.sqrt(area))


def _load_field_cube(url: str, fetch: RangeFetcher, center: SkyCoord, half_size_deg: float) -> FieldCube:
    hdus = scan_hdus(url, fetch, {"IMAGE", "SPECTRAL_CHANNELS"})
    image = hdus["IMAGE"]
    wcs = celestial_wcs(image.header)
    nx, ny = int(image.header["NAXIS1"]), int(image.header["NAXIS2"])

    x, y = (float(v) for v in wcs.world_to_pixel(center))
    if not (np.isfinite(x) and np.isfinite(y) and -0.5 <= x < nx - 0.5 and -0.5 <= y < ny - 0.5):
        raise OutsideTileError("The field center is not inside the HiPS tile.")

    half_px = math.ceil(half_size_deg / local_pixel_scale_deg(wcs, x, y)) + 2
    x0, x1 = max(0, round(x) - half_px), min(nx, round(x) + half_px + 1)
    y0, y1 = max(0, round(y) - half_px), min(ny, round(y) + half_px + 1)

    data = read_cube_rows(url, fetch, image, y0, y1, x0, x1)
    channels = read_table(url, fetch, hdus["SPECTRAL_CHANNELS"])
    return FieldCube(
        data=data,
        wcs=wcs.slice((slice(y0, y1), slice(x0, x1))),
        wavelength_um=np.asarray(channels["WAVELENGTH"], dtype=float),
        bandwidth_um=np.asarray(channels["BANDWIDTH"], dtype=float),
        unit=str(image.header.get("BUNIT", "MJy/sr")).strip() or "MJy/sr",
    )


def load_field_cube(
    ra_deg: float, dec_deg: float, half_size_deg: float, fetch: RangeFetcher | None = None
) -> FieldCube:
    """Spectral cube cut around (ra, dec), reading as little of the tile as possible."""
    url = tile_url(ra_deg, dec_deg)
    center = SkyCoord(ra_deg * u.deg, dec_deg * u.deg, frame="icrs")
    if fetch is not None:
        return _load_field_cube(url, fetch, center, half_size_deg)
    try:
        return _load_field_cube(url, http_range_fetch, center, half_size_deg)
    except RangeNotSupportedError:
        local_path = download_file(url, cache=True, timeout=HTTP_TIMEOUT_S * 10)
        return _load_field_cube(local_path, file_range_fetch, center, half_size_deg)
