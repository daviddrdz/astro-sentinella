import io
from collections.abc import Mapping

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
import astropy.units as u
from astropy.nddata import Cutout2D
from astropy.wcs import WCS
from matplotlib.figure import Figure

from services.irsa_archive import with_retries

DEFAULT_COLOR = "magma"
DEFAULT_SIZE = 1020
DEFAULT_TARGET_PX = 1020
VALID_COLORS = ("grey", "viridis", "magma", "inferno", "cividis", "cubehelix")
BAD_PIXEL_MASK = (
    (1 << 0)
    | (1 << 1)
    | (1 << 2)
    | (1 << 6)
    | (1 << 9)
    | (1 << 10)
    | (1 << 11)
    | (1 << 27)
)


def _image_hdu(hdul: fits.HDUList) -> fits.ImageHDU | fits.PrimaryHDU:
    if "IMAGE" in hdul:
        return hdul["IMAGE"]
    if len(hdul) <= 1 or hdul[1].data is None:
        raise ValueError("The FITS file does not have a valid image extension.")
    return hdul[1]


def _download_fits_image(
    fits_url: str,
    ra_deg: float,
    dec_deg: float,
    size_deg: float,
    subtract_zodi: bool = True,
    mask_bad_pixels: bool = True,
) -> tuple[np.ndarray, WCS]:
    if fits_url.startswith(("http://", "https://")):
        sep = "&" if "?" in fits_url else "?"
        target = f"{fits_url}{sep}center={ra_deg},{dec_deg}d&size={size_deg}d"
    else:
        target = fits_url

    def load():
        with fits.open(target, memmap=False, cache=False) as hdul:
            image_hdu = _image_hdu(hdul)
            image_data = np.array(image_hdu.data, dtype=np.float32)
            wcs = WCS(image_hdu.header)

            if subtract_zodi and "ZODI" in hdul:
                image_data -= np.asarray(hdul["ZODI"].data, dtype=np.float32)

            if mask_bad_pixels and "FLAGS" in hdul:
                flags_data = np.asarray(hdul["FLAGS"].data, dtype=np.uint32)
                image_data[(flags_data & BAD_PIXEL_MASK) != 0] = np.nan

        if wcs.has_celestial and size_deg > 0:
            position = SkyCoord(ra_deg * u.deg, dec_deg * u.deg, frame="icrs")
            cutout = Cutout2D(
                image_data,
                position,
                size=u.Quantity(size_deg, u.deg),
                wcs=wcs,
                mode="partial",
                fill_value=np.nan,
            )
            image_data = cutout.data
            wcs = cutout.wcs

        finite = np.isfinite(image_data)
        if not np.any(finite):
            return np.zeros_like(image_data, dtype=np.float32), wcs
        median_value = float(np.nanmedian(image_data[finite]))
        return np.nan_to_num(image_data, nan=median_value), wcs

    return with_retries(load, (OSError,), "Image download")


def _load_view(
    image_data: np.ndarray,
    wcs: WCS,
    ra_deg: float,
    dec_deg: float,
    size: int | None,
) -> tuple[np.ndarray, float, float]:
    if size is None or not wcs.has_celestial:
        view = image_data
    else:
        position = SkyCoord(ra_deg * u.deg, dec_deg * u.deg, frame="icrs")
        cutout = Cutout2D(
            image_data,
            position,
            size=u.Quantity((size, size), u.pixel),
            wcs=wcs,
            mode="partial",
            fill_value=np.nan,
        )
        view = cutout.data

    valid = np.isfinite(view)
    if not valid.any():
        raise ValueError("No valid pixels at the requested coordinate")
    low, high = np.nanpercentile(view, (1, 99))
    if not np.isfinite(low) or not np.isfinite(high) or low == high:
        raise ValueError("Not enough variation in the image to render it")
    return view, float(low), float(high)


def _blend_views(
    views: list[tuple[np.ndarray, float, float]],
) -> tuple[np.ndarray, float, float]:
    """Normalize and average aligned detector views into one composite image."""
    target_height = max(view.shape[0] for view, _, _ in views)
    target_width = max(view.shape[1] for view, _, _ in views)
    normalized = []
    valid_masks = []
    for view, low, high in views:
        normalized_view = np.clip((view - low) / (high - low), 0.0, 1.0)
        valid = np.isfinite(normalized_view)
        height_padding = target_height - view.shape[0]
        width_padding = target_width - view.shape[1]
        padding = (
            (height_padding // 2, height_padding - height_padding // 2),
            (width_padding // 2, width_padding - width_padding // 2),
        )
        normalized.append(
            np.pad(np.nan_to_num(normalized_view, nan=0.0), padding, constant_values=0.0)
        )
        valid_masks.append(np.pad(valid, padding, constant_values=False))

    values = np.stack(normalized)
    weights = np.stack(valid_masks)
    composite = values.sum(axis=0) / np.maximum(weights.sum(axis=0), 1)
    return composite, 0.0, 1.0


def render_image_png(
    coords: Mapping[str, object],
    index: int = 0,
    color: str = DEFAULT_COLOR,
    size: int | None = DEFAULT_SIZE,
    target_px: int = DEFAULT_TARGET_PX,
    bands: list[int] | tuple[int, ...] | None = None,
    *,
    image_loader=None,
) -> bytes:
    """Render one or more FITS images centered on a sky coordinate.

    ``image_loader`` is an internal adapter used by the backend to preserve
    its archive download, retry, masking, and cutout behavior.
    """
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        raise ValueError("index must be a non-negative integer")
    if color not in VALID_COLORS:
        raise ValueError(f"color must be one of: {', '.join(VALID_COLORS)}")
    if not isinstance(coords, Mapping):
        raise TypeError("coords must contain source, ra and dec")
    try:
        ra_deg, dec_deg = float(coords["ra"]), float(coords["dec"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("coords must contain ra and dec") from exc
    if size is not None and (not isinstance(size, int) or isinstance(size, bool) or size <= 0):
        raise ValueError("size must be a positive integer or None")
    if not isinstance(target_px, int) or isinstance(target_px, bool) or target_px <= 0:
        raise ValueError("target_px must be a positive integer")

    sources = coords.get("sources")
    source = coords.get("source")
    if source is None and sources is None:
        raise ValueError("coords must contain source or sources")

    if bands is None:
        if source is None:
            raise ValueError("coords must contain source when bands is not specified")
        selected_bands = None
    else:
        if isinstance(bands, (str, bytes)) or not isinstance(bands, (list, tuple)) or not bands:
            raise ValueError("bands must be a non-empty list or tuple of integers")
        selected_bands = []
        for band in bands:
            if not isinstance(band, int) or isinstance(band, bool) or band <= 0:
                raise ValueError("band IDs must be positive integers")
            if band in selected_bands:
                raise ValueError("bands must not contain duplicate IDs")
            selected_bands.append(band)

    if image_loader is None:
        image_loader = lambda image_source: _download_fits_image(
            str(image_source), ra_deg, dec_deg, 0.05
        )

    def load_source(image_source):
        image_data, wcs = image_loader(image_source)
        return _load_view(image_data, wcs, ra_deg, dec_deg, size)

    if selected_bands is None:
        views = [load_source(source)]
    else:
        if isinstance(sources, Mapping):
            source_for_band = lambda band: sources.get(band, sources.get(str(band)))
        elif isinstance(sources, (list, tuple)):
            source_for_band = lambda band: sources[band - 1] if band <= len(sources) else None
        elif len(selected_bands) == 1:
            source_for_band = lambda band: sources if band == selected_bands[0] else None
        else:
            raise ValueError("Multiple bands require sources as a mapping or sequence")

        views = []
        for band in selected_bands:
            image_source = source_for_band(band)
            if image_source is None:
                raise ValueError(f"No FITS source configured for band {band}")
            views.append(load_source(image_source))

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    composite = selected_bands is not None and len(views) > 1
    if composite:
        views = [_blend_views(views)]

    view, low, high = views[0]
    height, width = view.shape
    scale = max(1, target_px // max(height, width))
    fig = Figure(
        figsize=(width * scale / 100, height * scale / 100),
        dpi=100,
        facecolor="black",
    )
    axes = [fig.add_axes((0, 0, 1, 1))]

    cmap_name = "gray" if color == "grey" else color
    for axis, (view, low, high) in zip(axes, views):
        cmap = plt.get_cmap(cmap_name).with_extremes(bad="#1a1a1a")
        axis.imshow(
            view,
            origin="lower",
            cmap=cmap,
            vmin=low,
            vmax=high,
            interpolation="nearest",
        )
        axis.axis("off")
        axis.set_xlim(-0.5, view.shape[1] - 0.5)
        axis.set_ylim(-0.5, view.shape[0] - 0.5)

    if selected_bands is not None and not composite:
        for axis, band in zip(axes, selected_bands):
            axis.set_title(f"Detector {band}", color="white", fontsize=10)
        for axis in axes[len(views):]:
            axis.axis("off")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, facecolor="black")
    plt.close(fig)
    return buf.getvalue()
