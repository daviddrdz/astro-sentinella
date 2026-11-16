"""Synthetic SPHEREx Level-2 file + in-memory byte-range transport for tests."""
import io

import numpy as np
from astropy.io import fits

from services import fits_remote

SIZE = 40  # pixels per side
PIXEL_DEG = 6.15 / 3600


def make_level2_bytes(
    detector: int = 1,
    center=(10.0, 20.0),
    image: np.ndarray | None = None,
    variance: np.ndarray | None = None,
    zodi: np.ndarray | None = None,
) -> bytes:
    rng = np.random.default_rng(detector)
    image = rng.normal(1.0, 0.1, (SIZE, SIZE)).astype(np.float32) if image is None else image
    variance = np.full((SIZE, SIZE), 0.01, np.float32) if variance is None else variance
    zodi = np.full((SIZE, SIZE), 0.3, np.float32) if zodi is None else zodi

    header = fits.Header()
    header["EXTNAME"] = "IMAGE"
    header["DETECTOR"] = detector
    header["BUNIT"] = "MJy / sr"
    header["CTYPE1"], header["CTYPE2"] = "RA---TAN", "DEC--TAN"
    header["CRPIX1"] = header["CRPIX2"] = SIZE // 2 + 1  # 1-based -> 0-based index SIZE // 2
    header["CRVAL1"], header["CRVAL2"] = center
    header["CDELT1"], header["CDELT2"] = -PIXEL_DEG, PIXEL_DEG
    # Spectral lookup-table WCS (key W), as in real files: raw coords == FITS pixel coords.
    header["WCSAXESW"] = 2
    for axis in (1, 2):
        header[f"CTYPE{axis}W"] = "WAVE-TAB"
        header[f"CUNIT{axis}W"] = "um"
        header[f"CRPIX{axis}W"] = 1
        header[f"CRVAL{axis}W"] = 1
        header[f"CDELT{axis}W"] = 1
        header[f"PS{axis}_0W"] = "WCS-WAVE"
        header[f"PS{axis}_1W"] = "VALUES"
        header[f"PS{axis}_2W"] = "X" if axis == 1 else "Y"
        header[f"PV{axis}_3W"] = axis

    def image_hdu(name, data):
        h = header.copy()
        h["EXTNAME"] = name
        return fits.ImageHDU(data=data, header=h, name=name)

    # Wavelength increases with Y (row) and slightly with X, bandwidth constant; 3x3 control grid.
    ctrl = np.array([1, SIZE // 2, SIZE], dtype=np.int32)
    xs, ys = np.meshgrid(ctrl, ctrl)
    base = 0.75 + 0.3 * (detector - 1)
    waves = base + 0.3 * (ys - 1) / (SIZE - 1) + 0.01 * (xs - 1) / (SIZE - 1)
    values = np.stack([waves, np.full_like(waves, 0.02)], axis=-1).astype(np.float32)
    wave_table = fits.BinTableHDU.from_columns(
        [
            fits.Column(name="X", format="3J", dim="(3)", array=ctrl[None, :]),
            fits.Column(name="Y", format="3J", dim="(3)", array=ctrl[None, :]),
            fits.Column(name="VALUES", format="18E", dim="(2,3,3)", array=values[None, ...]),
        ],
        name="WCS-WAVE",
    )
    # Tile-compressed FLAGS exercises PCOUNT/heap handling in the header walk.
    flags = fits.CompImageHDU(
        data=np.zeros((SIZE, SIZE), np.int32), name="FLAGS", compression_type="RICE_1"
    )
    epsf = fits.BinTableHDU.from_columns(
        [fits.Column(name="PSF", format="25E", dim="(5,5)", array=np.zeros((4, 5, 5), np.float32))],
        name="EPSF",
    )
    hdul = fits.HDUList(
        [
            fits.PrimaryHDU(),
            image_hdu("IMAGE", image),
            flags,
            image_hdu("VARIANCE", variance),
            image_hdu("ZODI", zodi),
            epsf,
            wave_table,
        ]
    )
    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


class FakeTransport:
    """Serves byte ranges from in-memory files and records what was fetched."""

    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.requests: list[tuple[str, int, int]] = []

    def fetch(self, url, start, end):
        data = self.files[url]
        self.requests.append((url, start, end))
        return data[start : end + 1], len(data)

    @property
    def bytes_read(self) -> int:
        return sum(min(e, len(self.files[u]) - 1) - s + 1 for u, s, e in self.requests)


def install(monkeypatch, files: dict[str, bytes]) -> FakeTransport:
    transport = FakeTransport(files)
    monkeypatch.setattr(fits_remote, "_fetch", transport.fetch)
    return transport


def ibe_url(name: str) -> str:
    return f"https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/{name}"
