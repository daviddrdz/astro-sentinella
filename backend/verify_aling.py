import io
import json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from flask import Flask, Response, request

from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from astropy.coordinates import SkyCoord
from astropy.nddata import Cutout2D
from astropy.stats import mad_std, sigma_clipped_stats
from astropy.utils.data import download_file
from astropy import log as astropy_log
import astropy.units as u
from reproject import reproject_interp
from photutils.background import Background2D, MedianBackground
from photutils.detection import DAOStarFinder
from photutils.aperture import CircularAperture, aperture_photometry
from scipy import ndimage
from scipy.spatial import cKDTree

# Hide astropy INFO messages (the SIP notice is repeated every time a WCS is built)
astropy_log.setLevel("WARNING")

app = Flask(__name__)

RA, DEC, SIZE = 133.795, -7.2455, 512  # default values


# ---------------------------------------------------------------
# Image sources (URL or local path)
# ---------------------------------------------------------------
def resolve(source):
    """Return a local file path for `source`.

    - http(s) URL: downloaded once and reused from the astropy cache afterwards.
    - anything else: treated as a local path."""
    if source.lower().startswith(("http://", "https://")):
        return download_file(source, cache=True, show_progress=True, timeout=300)
    path = Path(source)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {source}")
    return str(path)


def read_mjd(path):
    """Observation time (MJD) from the header, or None if it is not there."""
    try:
        with fits.open(path, memmap=False) as hdul:
            headers = [hdul[1].header, hdul[0].header] if len(hdul) > 1 else [hdul[0].header]
        for header in headers:
            for key in ("T_MIN", "MJD-OBS", "MJD_OBS", "MJDOBS"):
                if key in header:
                    return float(header[key])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------
# Image reading and alignment
# ---------------------------------------------------------------
def open_image(path):
    with fits.open(path, memmap=False) as hdul:
        if len(hdul) < 2 or hdul[1].data is None:
            raise ValueError(f"The file has no image in extension 1: {path}")
        data = np.asarray(hdul[1].data, dtype=float)
        wcs = WCS(hdul[1].header)
    if data.ndim != 2:
        raise ValueError(f"The image must be two-dimensional: {path}")
    data[~np.isfinite(data)] = np.nan
    return data, wcs


def align(path_a, path_b, ra, dec, size):
    """Crop A around (ra, dec) and reproject B onto the same grid.

    Also reprojects A onto its own grid (control for the self-consistency test).
    Returns (a, b_aligned, a_self, wcs_cutout)."""
    if size <= 0:
        raise ValueError("size must be greater than zero")
    data_a, wcs_a = open_image(path_a)
    data_b, wcs_b = open_image(path_b)
    pos = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs")
    cutout = Cutout2D(data_a, pos, size=u.Quantity((size, size), u.pixel),
                      wcs=wcs_a, mode="partial", fill_value=np.nan)
    shape = cutout.data.shape
    b_aligned, _ = reproject_interp((data_b, wcs_b), cutout.wcs, shape_out=shape)
    a_self, _ = reproject_interp((data_a, wcs_a), cutout.wcs, shape_out=shape)
    return cutout.data, b_aligned, a_self, cutout.wcs


# ---------------------------------------------------------------
# Real wavelength at the field (WCS-WAVE)
# ---------------------------------------------------------------
def wavelength_at(path, ra, dec):
    """(wavelength, bandwidth) in microns at the pixel where (ra, dec) falls.

    In SPHEREx the wavelength changes across the detector, so the same source
    is seen at a different wavelength in each exposure. Returns None on failure."""
    try:
        with fits.open(path, memmap=False) as hdul:
            wcs = WCS(hdul[1].header)
            wcs_wave = WCS(hdul[1].header, fobj=hdul, key="W")
            wcs_wave.sip = None
        x, y = wcs.world_to_pixel(SkyCoord(ra * u.deg, dec * u.deg, frame="icrs"))
        lam, bw = wcs_wave.pixel_to_world(x, y)
        return (round(float(lam.to(u.micrometer).value), 4),
                round(float(bw.to(u.micrometer).value), 4))
    except Exception:
        return None


def compare_wavelengths(wave_a, wave_b):
    if wave_a is None or wave_b is None:
        return {"available": False}
    diff = abs(wave_a[0] - wave_b[0])
    same = bool(diff <= max(wave_a[1], wave_b[1]) / 2)
    return {
        "available": True,
        "wavelength_A_um": wave_a[0],
        "wavelength_B_um": wave_b[0],
        "difference_um": round(diff, 4),
        "same_wavelength": same,
        "warning": None if same else
        "A and B see the field at different wavelengths: stellar residuals are expected",
    }


# ---------------------------------------------------------------
# Stars
# ---------------------------------------------------------------
def detect_stars(img):
    """Return an (N, 2) array with the (x, y) centroids of the detected stars."""
    mask = ~np.isfinite(img)
    img = np.nan_to_num(img - np.nanmedian(img))
    sigma = mad_std(img[~mask])
    table = DAOStarFinder(fwhm=2.5, threshold=8 * sigma)(img, mask=mask)
    if table is None:
        return np.empty((0, 2))
    # photutils >= 3.0 renames the columns (xcentroid -> x_centroid)
    cx, cy = (("x_centroid", "y_centroid") if "x_centroid" in table.colnames
              else ("xcentroid", "ycentroid"))
    return np.c_[table[cx], table[cy]]


def match_stars(sa, sb, max_dist=2.0):
    """Mutual nearest-neighbour matches. Returns (idx_a, idx_b)."""
    dist_ab, idx_ab = cKDTree(sb).query(sa, distance_upper_bound=max_dist)
    _, idx_ba = cKDTree(sa).query(sb, distance_upper_bound=max_dist)
    idx_a = np.arange(len(sa))
    ok = np.isfinite(dist_ab) & (idx_ab < len(sb))
    idx_a, idx_b = idx_a[ok], idx_ab[ok]
    mutual = idx_ba[idx_b] == idx_a
    return idx_a[mutual], idx_b[mutual]


# ---------------------------------------------------------------
# Real alignment metrics
# ---------------------------------------------------------------
def compute_and_print_metrics(pair, a, b_aligned, a_self, wcs_cutout, size):
    """Measure the alignment between A and B and print a JSON report.

    Everything here is measured from the images (nothing is hardcoded)."""
    scale = float(np.mean(proj_plane_pixel_scales(wcs_cutout)) * 3600.0)  # arcsec/px

    # Test 1: A reprojected onto itself minus A must be ~0 (below the noise)
    noise_a = float(mad_std(a[np.isfinite(a)]))
    std_self = float(np.nanstd(a_self - a))

    # Test 2: displacement of the matched stars between A and aligned B
    sa, sb = detect_stars(a), detect_stars(b_aligned)
    report = {
        "images": {"A": pair["source_a"], "B": pair["source_b"]},
        "epochs": {"mjd_A": pair["mjd_a"], "mjd_B": pair["mjd_b"],
                   "days_between": pair["days"]},
        "scale_arcsec_per_pixel": round(scale, 3),
        "test_1_self_consistency": {
            "std_A_minus_reprojected_A": std_self,
            "noise_of_A": noise_a,
            "ok": bool(std_self <= noise_a),
        },
        "wavelength": compare_wavelengths(pair["wave_a"], pair["wave_b"]),
    }

    if len(sa) < 10 or len(sb) < 10:
        report["test_2_star_displacement"] = {
            "error": "Too few stars detected to measure",
            "stars_detected_A": int(len(sa)),
            "stars_detected_B": int(len(sb)),
        }
        report["verdict"] = "COULD NOT MEASURE ALIGNMENT"
    else:
        ia, ib = match_stars(sa, sb)
        x, y = sa[ia, 0], sa[ia, 1]
        dx, dy = sb[ib, 0] - x, sb[ib, 1] - y

        if len(dx) < 10:
            report["test_2_star_displacement"] = {
                "error": "Too few matched stars",
                "stars_detected_A": int(len(sa)),
                "stars_detected_B": int(len(sb)),
                "stars_matched": int(len(dx)),
            }
            report["verdict"] = "COULD NOT MEASURE ALIGNMENT"
        else:
            # Drop false pairs (values far from the median)
            good = ((np.abs(dx - np.median(dx)) < 3 * max(mad_std(dx), 0.05)) &
                    (np.abs(dy - np.median(dy)) < 3 * max(mad_std(dy), 0.05)))
            x, y, dx, dy = x[good], y[good], dx[good], dy[good]

            dx_med, dy_med = float(np.median(dx)), float(np.median(dy))

            # Trend with position: how much the displacement changes from one edge
            # to the other (large => rotation or scale error even if the median is ~0)
            slopes = [np.polyfit(pos, d, 1)[0] * size
                      for pos in (x, y) for d in (dx, dy)]
            trend = float(max(abs(s) for s in slopes))

            aligned_ok = bool(abs(dx_med) < 0.2 and abs(dy_med) < 0.2 and trend < 0.3)

            report["test_2_star_displacement"] = {
                "stars_detected_A": int(len(sa)),
                "stars_detected_B": int(len(sb)),
                "stars_used": int(len(dx)),
                "dx_median_px": round(dx_med, 3),
                "dy_median_px": round(dy_med, 3),
                "dx_scatter_px": round(float(mad_std(dx)), 3),
                "dy_scatter_px": round(float(mad_std(dy)), 3),
                "total_displacement_arcsec": round(float(np.hypot(dx_med, dy_med)) * scale, 3),
                "trend_across_image_px": round(trend, 3),
            }
            report["verdict"] = "ALIGNMENT OK" if aligned_ok else "CHECK ALIGNMENT"
            report["criterion"] = "|dx|,|dy| medians < 0.2 px and trend < 0.3 px"

    print("\n--- ASTROMETRIC ALIGNMENT REPORT ---")
    print(json.dumps(report, indent=4, ensure_ascii=False))
    print("------------------------------------\n")


# ---------------------------------------------------------------
# Preparation for the subtraction: background, flux, PSF
# ---------------------------------------------------------------
def remove_background(img, box=64):
    """Subtract a smooth 2D background (sigma-clipped median per box).

    Sigma-clipping keeps the stars from contaminating the background."""
    mask = ~np.isfinite(img)
    clean = np.where(mask, 0.0, img)
    try:
        bkg = Background2D(
            clean, box_size=box, filter_size=3,
            coverage_mask=mask, fill_value=0.0,
            exclude_percentile=50.0, bkg_estimator=MedianBackground(),
        )
        return img - bkg.background
    except Exception:
        # Fallback: global median only
        return img - np.nanmedian(img)


def flux_factor(a, b, radius=3.0):
    """Factor f such that b / f matches the flux of the stars in a.

    Uses aperture photometry on mutually matched stars (a and b must already
    be on the same grid and background-subtracted). Returns (f, n_stars)."""
    sa, sb = detect_stars(a), detect_stars(b)
    if len(sa) < 10 or len(sb) < 10:
        return 1.0, 0

    ia, _ = match_stars(sa, sb)
    pos = sa[ia]
    if len(pos) < 10:
        return 1.0, 0

    ap = CircularAperture(pos, r=radius)
    fa = np.asarray(aperture_photometry(np.nan_to_num(a), ap,
                                        mask=~np.isfinite(a))["aperture_sum"], dtype=float)
    fb = np.asarray(aperture_photometry(np.nan_to_num(b), ap,
                                        mask=~np.isfinite(b))["aperture_sum"], dtype=float)

    ok = (fa > 0) & (fb > 0)
    if ok.sum() < 10:
        return 1.0, 0

    _, median, _ = sigma_clipped_stats(fb[ok] / fa[ok], sigma=3.0)
    if not np.isfinite(median) or median <= 0:
        return 1.0, 0
    return float(median), int(ok.sum())


def masked_smooth(img, valid, sigma):
    """Gaussian smoothing that does not treat invalid pixels as zeros."""
    if sigma <= 0:
        return img.copy(), valid.copy()
    weight = ndimage.gaussian_filter(valid.astype(float), sigma=sigma)
    numerator = ndimage.gaussian_filter(np.where(valid, img, 0.0), sigma=sigma)
    result = np.zeros_like(img, dtype=float)
    np.divide(numerator, weight, out=result, where=weight > 1e-6)
    return result, weight > 0.995


def match_psf(
    a, b, valid,
    sigmas=(0.0, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0),
):
    """Find the blur that makes the star profiles of A and B most similar.

    Tries a Gaussian blur on A or on B and keeps the one with the smallest
    relative residual in the star regions (so the brightest stars do not
    dominate). Returns (a2, b2, sigma_px, 'A' | 'B' | '-')."""
    valid = np.asarray(valid, dtype=bool) & np.isfinite(a) & np.isfinite(b)
    if valid.sum() < 100:
        return a, b, 0.0, "-"

    noise = float(mad_std(np.concatenate([a[valid], b[valid]])))
    if not np.isfinite(noise) or noise <= 0:
        noise = 1e-12

    star_mask = ((np.abs(a) > 5 * noise) | (np.abs(b) > 5 * noise)) & valid
    star_mask = ndimage.binary_dilation(star_mask, iterations=5) & valid
    if star_mask.sum() < 20:
        return a, b, 0.0, "-"

    best_score = np.inf
    best = (a, b, 0.0, "-")
    for which in ("A", "B"):
        for sigma in sigmas:
            if which == "A":
                a2, support = masked_smooth(a, valid, sigma)
                b2 = b
            else:
                b2, support = masked_smooth(b, valid, sigma)
                a2 = a

            region = star_mask & support
            if region.sum() < 20:
                continue

            difference = b2[region] - a2[region]
            local_scale = np.maximum(
                0.5 * (np.abs(a2[region]) + np.abs(b2[region])), noise
            )
            rel_residual = np.abs(difference) / local_scale
            limit = np.nanpercentile(rel_residual, 90)
            trimmed = rel_residual[rel_residual <= limit]
            score = float(np.mean(trimmed ** 2)) if trimmed.size else np.inf

            if score < best_score:
                best_score = score
                best = (a2, b2, float(sigma), which)
    return best


def prepare_for_subtraction(a, b):
    """Local background -> flux normalization -> PSF matching -> refined flux.

    Returns (a2, b2, info) with NaN outside the common valid area."""
    a0, b0 = remove_background(a), remove_background(b)
    valid = np.isfinite(a0) & np.isfinite(b0)
    a0, b0 = np.where(valid, a0, np.nan), np.where(valid, b0, np.nan)

    factor, n_stars = flux_factor(a0, b0)
    b0 = b0 / factor

    a_f, b_f, psf_sigma, which = match_psf(np.nan_to_num(a0), np.nan_to_num(b0), valid)
    a2, b2 = np.where(valid, a_f, np.nan), np.where(valid, b_f, np.nan)

    # With the PSF matched, a second fit (larger aperture) refines the factor
    f2, _ = flux_factor(a2, b2, radius=4.0)
    b2, factor = b2 / f2, factor * f2

    return a2, b2, {"factor": factor, "n_stars": n_stars,
                    "psf_sigma": psf_sigma, "psf_on": which}


def wave_suffix(wave):
    return f"  λ={wave[0]:.2f} µm" if wave else ""


def mjd_suffix(mjd):
    return f"  MJD {mjd:.1f}" if mjd is not None else ""


@app.route("/")
def index():
    source_a, source_b = request.args.get("a"), request.args.get("b")
    if not source_a or not source_b:
        return ("Usage: /?a=<URL or path of image A>&b=<URL or path of image B>"
                "  (optional: &ra=&dec=&size=)"), 400

    try:
        ra = float(request.args.get("ra", RA))
        dec = float(request.args.get("dec", DEC))
        size = int(request.args.get("size", SIZE))

        path_a, path_b = resolve(source_a), resolve(source_b)
        a, b, a_self, wcs_cutout = align(path_a, path_b, ra, dec, size)
    except Exception as e:
        return f"Error: {e}", 400

    mjd_a, mjd_b = read_mjd(path_a), read_mjd(path_b)
    pair = {
        "source_a": source_a, "source_b": source_b,
        "mjd_a": None if mjd_a is None else round(mjd_a, 2),
        "mjd_b": None if mjd_b is None else round(mjd_b, 2),
        "days": None if mjd_a is None or mjd_b is None else round(mjd_b - mjd_a, 1),
        "wave_a": wavelength_at(path_a, ra, dec),
        "wave_b": wavelength_at(path_b, ra, dec),
    }

    # The report must never break the image, so failures are only printed
    try:
        compute_and_print_metrics(pair, a, b, a_self, wcs_cutout, size)
    except Exception as e:
        print(f"Could not compute the alignment report: {e}")

    # Local background, flux normalization and PSF matching
    a_clean, b_clean, info = prepare_for_subtraction(a, b)

    # Signed subtraction: B - A
    #   red = brighter in B, blue = brighter in A
    diff = b_clean - a_clean

    if not np.isfinite(diff).any():
        return "Error: no valid pixels, the images do not overlap in this area", 422

    # Symmetric limits so that white means "no difference"
    lim = np.nanpercentile(np.abs(diff), 98)
    valid = np.isfinite(a_clean) & np.isfinite(b_clean)
    vmax = np.nanpercentile(np.concatenate([a_clean[valid], b_clean[valid]]), 99)
    if not np.isfinite(vmax) or not np.isfinite(lim) or lim == 0:
        return "Error: not enough variation in the valid pixels", 422

    gray = plt.get_cmap("gray").copy()
    gray.set_bad("#1a1a1a")
    berlin = plt.get_cmap("berlin").copy()
    berlin.set_bad("#1a1a1a")  # only NaN pixels remain here (no-data areas)

    title_a = "Image A" + mjd_suffix(pair["mjd_a"]) + wave_suffix(pair["wave_a"])
    title_b = (f"Image B (aligned, ÷{info['factor']:.3f}, {info['n_stars']} stars)"
               + mjd_suffix(pair["mjd_b"]) + wave_suffix(pair["wave_b"]))
    title_diff = "Difference (B - A)"
    if pair["days"] is not None:
        title_diff += f", {pair['days']:.0f} days apart"
    if info["psf_sigma"] > 0:
        title_diff += f"  (PSF: blur {info['psf_sigma']:g} px on {info['psf_on']})"
        if info["psf_sigma"] >= 8.0:
            title_diff += " [optimum at limit: check PSF]"
    wave_check = compare_wavelengths(pair["wave_a"], pair["wave_b"])
    if wave_check["available"] and not wave_check["same_wavelength"]:
        title_diff += "\nDIFFERENT WAVELENGTHS: stellar residuals expected"

    fig, axes = plt.subplots(1, 3, figsize=(18, 6), facecolor="black")
    for ax, img, title, cmap, vmin, vm in (
        (axes[0], a_clean, title_a, gray, 0, vmax),
        (axes[1], b_clean, title_b, gray, 0, vmax),
        (axes[2], diff, title_diff, berlin, -lim, lim),
    ):
        ax.imshow(img, origin="lower", cmap=cmap, vmin=vmin, vmax=vm)
        ax.set_title(title, color="white")
        ax.axis("off")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, facecolor="black")
    plt.close(fig)
    return Response(buf.getvalue(), mimetype="image/png")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, use_reloader=True)