"""Partial reads of SPHEREx Level-2 FITS files via HTTP byte ranges.

Files are ~65 MB; a spectrum needs a few pixels from hundreds of them, so we
walk the HDU headers once per file (cached) and then fetch only the bytes we
need from the public S3 mirror of the IRSA archive.
"""
from dataclasses import dataclass

import numpy as np
import requests
from astropy.io import fits
from requests.adapters import HTTPAdapter

from services.cache import TTLCache
from services.irsa_archive import with_retries

S3_BASE = "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/"
IBE_PREFIX = "ibe/data/spherex/"
BLOCK = 2880
# PRIMARY + IMAGE headers of DR1 files fit in exactly 10 blocks; later HDU headers are shorter.
FIRST_HEADER_CHUNK = BLOCK * 10
HEADER_CHUNK = BLOCK * 6
REQUEST_TIMEOUT_S = 15
LAYOUT_CACHE = TTLCache(ttl_s=6 * 3600, max_items=1024)

_END_CARD = b"END" + b" " * 77
_BITPIX_DTYPES = {8: "u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}

_session = requests.Session()
_session.mount("https://", HTTPAdapter(pool_connections=4, pool_maxsize=32))


class RemoteFitsError(Exception):
    pass


class RangeNotSupportedError(RemoteFitsError):
    """The server answered a Range request with the whole file (HTTP 200)."""


@dataclass(frozen=True)
class HduInfo:
    name: str
    header: fits.Header
    data_start: int
    data_len: int


def s3_url(access_url: str) -> str:
    """Map an IRSA IBE access URL onto the public S3 mirror (same key)."""
    idx = access_url.find(IBE_PREFIX)
    if idx == -1:
        raise ValueError(f"Not an IBE SPHEREx URL: {access_url}")
    return S3_BASE + access_url[idx + len(IBE_PREFIX):]


def _fetch(url: str, start: int, end: int) -> tuple[bytes, int | None]:
    """GET bytes [start, end]; returns (content, total file size from Content-Range)."""

    def do_request():
        resp = _session.get(
            url, headers={"Range": f"bytes={start}-{end}"}, timeout=REQUEST_TIMEOUT_S
        )
        if resp.status_code >= 500:
            raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
        if resp.status_code == 200:
            raise RangeNotSupportedError(url)
        if resp.status_code == 416:  # asked past the end of the file
            return b"", None
        if resp.status_code != 206:
            raise RemoteFitsError(f"Range request failed with HTTP {resp.status_code}")
        content_range = resp.headers.get("Content-Range", "")
        total = int(content_range.rsplit("/", 1)[1]) if "/" in content_range else None
        return resp.content, total

    return with_retries(do_request, (requests.RequestException,), "FITS range read")


def read_range(url: str, start: int, end: int) -> bytes:
    return _fetch(url, start, end)[0]


def _find_end_card(buf: bytes, offset: int) -> int:
    idx = buf.find(_END_CARD, offset)
    while idx != -1 and (idx - offset) % 80 != 0:
        idx = buf.find(_END_CARD, idx + 1)
    return idx


def _data_len(header: fits.Header) -> int:
    naxis = header["NAXIS"]
    if naxis == 0:
        return 0
    cells = 1
    for i in range(1, naxis + 1):
        cells *= header[f"NAXIS{i}"]
    itemsize = abs(header["BITPIX"]) // 8
    return itemsize * header.get("GCOUNT", 1) * (header.get("PCOUNT", 0) + cells)


def _padded(length: int) -> int:
    return ((length + BLOCK - 1) // BLOCK) * BLOCK


def _walk_layout(url: str) -> list[HduInfo]:
    layout: list[HduInfo] = []
    buf, buf_start, pos, total = b"", 0, 0, None
    chunk = FIRST_HEADER_CHUNK
    while total is None or pos < total:
        if not (buf_start <= pos < buf_start + len(buf)):
            buf, total = _fetch(url, pos, pos + chunk - 1)
            buf_start = pos
        rel = pos - buf_start
        while (idx := _find_end_card(buf, rel)) == -1:
            more, total = _fetch(url, buf_start + len(buf), buf_start + len(buf) + chunk - 1)
            if not more:
                raise RemoteFitsError("Truncated FITS header")
            buf += more
        header = fits.Header.fromstring(buf[rel : idx + 80].decode("ascii"))
        header_len = _padded(idx + 80 - rel)
        data_len = _data_len(header)
        layout.append(
            HduInfo(header.get("EXTNAME", "PRIMARY"), header, pos + header_len, data_len)
        )
        pos += header_len + _padded(data_len)
        chunk = HEADER_CHUNK
    return layout


def hdu_layout(url: str) -> list[HduInfo]:
    """Return every HDU's header and data byte offsets, fetching headers only."""
    return LAYOUT_CACHE.get_or_compute(url, lambda: _walk_layout(url))


def find_hdu(layout: list[HduInfo], name: str) -> HduInfo:
    for hdu in layout:
        if hdu.name == name:
            return hdu
    raise RemoteFitsError(f"FITS file has no {name!r} extension")


def read_image_window(
    url: str, hdu: HduInfo, row0: int, row1: int, col0: int, col1: int
) -> np.ndarray:
    """Read the inclusive pixel window [row0..row1] x [col0..col1] of a 2D image HDU."""
    header = hdu.header
    width, height = header["NAXIS1"], header["NAXIS2"]
    if not (0 <= row0 <= row1 < height and 0 <= col0 <= col1 < width):
        raise ValueError("Pixel window is outside the image")
    dtype = np.dtype(_BITPIX_DTYPES[header["BITPIX"]])
    first = row0 * width + col0
    last = row1 * width + col1
    raw = read_range(
        url, hdu.data_start + first * dtype.itemsize, hdu.data_start + (last + 1) * dtype.itemsize - 1
    )
    flat = np.frombuffer(raw, dtype=dtype)
    rows = [
        flat[(r * width + col0) - first : (r * width + col1 + 1) - first]
        for r in range(row0, row1 + 1)
    ]
    window = np.stack(rows).astype(np.float64)
    return window * header.get("BSCALE", 1.0) + header.get("BZERO", 0.0)


def read_table(url: str, hdu: HduInfo) -> fits.BinTableHDU:
    """Read a whole (small) binary table extension."""
    raw = read_range(url, hdu.data_start, hdu.data_start + hdu.data_len - 1)
    padded = raw + b"\x00" * (_padded(len(raw)) - len(raw))
    return fits.BinTableHDU.fromstring(hdu.header.tostring().encode("ascii") + padded)
