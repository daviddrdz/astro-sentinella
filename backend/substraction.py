from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import astropy.units as u
from astropy import log as astropy_log
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.nddata import Cutout2D
from astropy.stats import SigmaClip, mad_std, sigma_clipped_stats
from astropy.utils.data import download_file
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from photutils.aperture import (ApertureStats, CircularAnnulus, CircularAperture,
                                aperture_photometry)
from photutils.background import Background2D, MedianBackground
from photutils.detection import DAOStarFinder
from reproject import reproject_interp
from scipy import ndimage
from scipy.spatial import cKDTree

astropy_log.setLevel("WARNING")   # hide the repeated SIP notice

# ---------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------
DIFF_THRESH = 6.0       # significance threshold (sigma) for flux or position changes
DET_SIGMA = 6.0         # source detection threshold (per pixel, sigma)
FWHM = 2.5              # PSF FWHM in pixels
AP_R, ANN_IN, ANN_OUT = 3.0, 6.0, 9.0   # aperture / sky annulus radii (px)
EDGE_PX = 4             # pixels trimmed from the edges of the valid area
MATCH_PX = 3.0          # radius of the first (static) cross-match
MAX_PM_PX = 8.0         # maximum motion searched for moving sources (px)
MIN_SHIFT_PX = 0.3      # minimum motion to call a source "moving"
MAX_CAND = 50           # maximum candidates returned
MAX_SHARP = 1.8         # reject sources sharper than this x a real star
MAX_CHANCE = 0.02       # reject "moving" pairs likelier than this to be chance
MAX_STELLAR_PM = 10.5   # arcsec/yr; Barnard's Star is ~10.4
CLASSES = ("variable", "moving", "only_in_A", "only_in_B")
MARKER_STYLE = {"variable": ("o", "lime"), "moving": ("o", "magenta"),
                "only_in_A": ("s", "cyan"), "only_in_B": ("s", "yellow")}


# ---------------------------------------------------------------
# Loading (URL, path or buffer)
# ---------------------------------------------------------------
def resolve(source):
    """Return something fits.open accepts.

    - http(s) URL: downloaded once (astropy cache) and returned as a local path.
    - str/Path: checked and returned as a path.
    - file-like object (BytesIO): returned as is."""
    if hasattr(source, "read"):
        return source
    source = str(source)
    if source.lower().startswith(("http://", "https://")):
        return download_file(source, cache=True, show_progress=False, timeout=300)
    if not Path(source).is_file():
        raise FileNotFoundError(f"File not found: {source}")
    return source


def _fits_open(source):
    """fits.open that rewinds buffers, so one BytesIO can be opened several times."""
    if hasattr(source, "seek"):
        source.seek(0)
    return fits.open(source, memmap=False)


def _label(source):
    return "<buffer>" if hasattr(source, "read") else str(source)


def open_fits_image(fits_source):
    """Open a FITS image from a path or an in-memory buffer.

    Returns (data 2D float with NaN, WCS)."""
    with _fits_open(fits_source) as hdul:
        if len(hdul) < 2 or hdul[1].data is None:
            raise ValueError("The FITS file does not have a valid image extension at index [1].")
        data = np.asarray(hdul[1].data, dtype=float)
        wcs = WCS(hdul[1].header)

    if data.ndim != 2:
        raise ValueError(f"The image must be two-dimensional (found {data.ndim} dimensions).")

    data[~np.isfinite(data)] = np.nan
    return data, wcs


open_image = open_fits_image   # alias


def read_mjd(source):
    """Observation time (MJD) from the header, or None."""
    try:
        with _fits_open(source) as hdul:
            headers = [hdul[1].header, hdul[0].header] if len(hdul) > 1 else [hdul[0].header]
        for header in headers:
            for key in ("T_MIN", "MJD-OBS", "MJD_OBS", "MJDOBS"):
                if key in header:
                    return float(header[key])
    except Exception:
        pass
    return None


def wavelength_at(source, ra, dec):
    """(wavelength, bandwidth) in microns at the pixel where (ra, dec) falls, or None.

    In SPHEREx the wavelength changes across the detector."""
    try:
        with _fits_open(source) as hdul:
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
    """Compare the wavelengths of A and B at the field centre."""
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
# Alignment
# ---------------------------------------------------------------
def align_images(source_a, source_b, ra, dec, size, return_wcs=False):
    """Crop image A around (ra, dec) and reproject B onto that exact WCS grid.

    Parameters:
        source_a, source_b: file paths (str/Path) or in-memory buffers.
        ra, dec (float): degrees.
        size (int): cutout size in pixels.
        return_wcs (bool): also return the cutout WCS.

    Returns (cutout_a, b_aligned), or (cutout_a, b_aligned, wcs) if return_wcs.
    b_aligned is NaN wherever B has no coverage or A has no data."""
    if size <= 0:
        raise ValueError("Size must be greater than zero.")

    data_a, wcs_a = open_fits_image(source_a)
    data_b, wcs_b = open_fits_image(source_b)

    pos = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs")
    cutout = Cutout2D(data_a, pos, size=u.Quantity((size, size), u.pixel),
                      wcs=wcs_a, mode="partial", fill_value=np.nan)

    b_aligned, footprint = reproject_interp((data_b, wcs_b), cutout.wcs,
                                            shape_out=cutout.data.shape)
    ok = (footprint > 0) & np.isfinite(b_aligned) & np.isfinite(cutout.data)
    b_aligned = np.where(ok, b_aligned, np.nan)

    if return_wcs:
        return cutout.data, b_aligned, cutout.wcs
    return cutout.data, b_aligned


# ---------------------------------------------------------------
# Background and preparation
# ---------------------------------------------------------------
def subtract_background(img, valid, box=64):
    """Subtract a smooth 2D sky background.

    Returns (img - background, rms_map); NaN outside `valid`."""
    filled = np.where(valid, img, 0.0)
    try:
        bkg = Background2D(filled, (box, box), filter_size=(3, 3), mask=~valid,
                           exclude_percentile=50.0, bkg_estimator=MedianBackground(),
                           sigma_clip=SigmaClip(3.0))
        back, rms = bkg.background, bkg.background_rms
    except Exception:
        _, med, sd = sigma_clipped_stats(img[valid], sigma=3.0)
        back, rms = np.full(img.shape, med), np.full(img.shape, sd)
    return np.where(valid, img - back, np.nan), np.maximum(rms, 1e-12)


def remove_background(img, box=64):
    """Remove the 2D background (photutils, with a global-median fallback).

    Returns the background-subtracted image (NaN preserved)."""
    valid = np.isfinite(img)
    if not valid.any():
        return img
    try:
        return subtract_background(img, valid, box)[0]
    except Exception:
        return img - np.nanmedian(img)


def prepare(a, b):
    """Background-subtract both images. Returns (a0, b0, rms_a, rms_b, core).

    `core` is the overlap of both images trimmed by EDGE_PX at every border, so
    reprojection edges do not produce fake detections."""
    valid = np.isfinite(a) & np.isfinite(b)
    if valid.sum() < 100:
        raise ValueError("Too few overlapping pixels to subtract")
    core = ndimage.binary_erosion(valid, iterations=EDGE_PX)
    a0, rms_a = subtract_background(a, valid)
    b0, rms_b = subtract_background(b, valid)
    return a0, b0, rms_a, rms_b, core


# ---------------------------------------------------------------
# Pixel-level subtraction
# ---------------------------------------------------------------
def difference_image(a0, b0, core, rms_a, rms_b, scale_mode="auto", thresh=DIFF_THRESH):
    """D = A0 - k*B0 and its significance map D/sigma.

    k is fitted from pixels bright in both images (scale_mode="auto") or fixed
    to 1 ("none"). sigma is the robust (MAD) scatter of D."""
    sd_a, sd_b = float(np.median(rms_a[core])), float(np.median(rms_b[core]))
    k, k_pixels = 1.0, 0
    if scale_mode == "auto":
        with np.errstate(invalid="ignore"):
            bright = core & (a0 > 3 * sd_a) & (b0 > 3 * sd_b)
        if bright.sum() >= 50:
            x, y = b0[bright], a0[bright]
            for _ in range(5):
                k = float(np.sum(y) / np.sum(x))
                res = y - k * x
                keep = np.abs(res) < 3 * max(mad_std(res), 1e-12)
                if keep.sum() < 50 or keep.all():
                    break
                x, y = x[keep], y[keep]
            k_pixels = int(len(x))
    if not np.isfinite(k) or k <= 0:
        k, k_pixels = 1.0, 0

    diff = np.where(core, a0 - k * b0, np.nan)
    sigma_d = float(mad_std(diff[core]))
    sigma_d = sigma_d if sigma_d > 0 else float(np.nanstd(diff))
    snr = diff / sigma_d
    snr_f = np.nan_to_num(snr, nan=0.0)
    expected = float(np.hypot(sd_a, k * sd_b))

    report = {
        "formula": "A0 - k * B0  (A0, B0 = images minus a smooth 2D background)",
        "scale_mode": scale_mode,
        "flux_scale_k": round(k, 4),
        "pixels_used_for_k": k_pixels,
        "noise_A": round(sd_a, 4),
        "noise_B": round(sd_b, 4),
        "sigma_difference_measured": round(sigma_d, 4),
        "sigma_difference_expected": round(expected, 4),
        "excess_noise_ratio": round(sigma_d / expected, 2) if expected > 0 else None,
        "n_pixels_above_thresh_positive": int(np.sum(snr_f > thresh)),
        "n_pixels_above_thresh_negative": int(np.sum(snr_f < -thresh)),
    }
    return {"diff": diff, "snr": snr, "k": k, "sigma": sigma_d, "report": report}


# ---------------------------------------------------------------
# Source detection and photometry
# ---------------------------------------------------------------
def detect_stars(img, nsigma=8.0):
    """(N, 2) array with the (x, y) centroids of the detected stars."""
    mask = ~np.isfinite(img)
    img = np.nan_to_num(img - np.nanmedian(img))
    sigma = mad_std(img[~mask])
    table = DAOStarFinder(fwhm=FWHM, threshold=nsigma * sigma)(img, mask=mask)
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


def photometry(img0, rms, pos):
    """Aperture photometry at pos (N, 2) on a background-subtracted image.

    Returns (flux, error, peak_fraction). peak_fraction ~1 means a hot pixel or
    cosmic ray instead of a PSF."""
    data = np.nan_to_num(img0)
    mask = ~np.isfinite(img0)
    ap, ann = CircularAperture(pos, AP_R), CircularAnnulus(pos, ANN_IN, ANN_OUT)
    total = np.asarray(aperture_photometry(data, ap, mask=mask)["aperture_sum"], dtype=float)
    local = ApertureStats(data, ann, mask=mask, sigma_clip=SigmaClip(3.0)).median
    local = np.nan_to_num(np.asarray(local, dtype=float))
    n_ap = np.pi * AP_R ** 2
    n_ann = np.pi * (ANN_OUT ** 2 - ANN_IN ** 2)
    flux = total - local * n_ap
    h, w = data.shape
    xi = np.clip(np.rint(pos[:, 0]).astype(int), 0, w - 1)
    yi = np.clip(np.rint(pos[:, 1]).astype(int), 0, h - 1)
    err = rms[yi, xi] * np.sqrt(n_ap * (1 + n_ap / n_ann))
    peak = np.array([data[max(j - 1, 0):j + 2, max(i - 1, 0):i + 2].max()
                     for i, j in zip(xi, yi)])
    frac = np.where(flux > 0, peak / np.where(flux > 0, flux, 1.0), np.nan)
    return flux, err, frac


def flux_scale(fa, ea, fb, eb):
    """Global flux ratio k (A/B) and fractional systematic error, from bright stars."""
    sel = (fa > 0) & (fb > 0) & (fa / ea > 20) & (fb / eb > 20)
    if sel.sum() < 10:
        return 1.0, 0.05
    _, k, _ = sigma_clipped_stats(fa[sel] / fb[sel], sigma=3.0)
    rel = (fa[sel] - k * fb[sel]) / (0.5 * (fa[sel] + k * fb[sel]))
    return float(k), max(float(mad_std(rel)), 0.02)


def flux_test(fa, ea, fb, eb, k, s):
    """(delta, sigma, significance) of A - k*B. The systematic term s*flux keeps
    bright stars (PSF / interpolation residuals) from looking like variables."""
    delta = fa - k * fb
    mean = 0.5 * (np.abs(fa) + np.abs(k * fb))
    sigma = np.sqrt(ea ** 2 + (k * eb) ** 2 + (s * mean) ** 2)
    return delta, sigma, delta / sigma


def frac_reference(phot, idx):
    """Typical peak/flux ratio of real stars (bright matched ones)."""
    flux, err, frac = phot
    good = (flux[idx] / err[idx] > 20) & np.isfinite(frac[idx])
    return float(np.median(frac[idx][good])) if good.sum() >= 10 else 0.2


# ---------------------------------------------------------------
# Source-level changes (variable, moving, new, vanished)
# ---------------------------------------------------------------
def find_changes(a0, b0, rms_a, rms_b, core, wcs, days,
                 thresh=DIFF_THRESH, maxpm=MAX_PM_PX,
                 maxsharp=MAX_SHARP, chance=MAX_CHANCE, maxcand=MAX_CAND):
    """Compare the two epochs source by source.

    Classes:
        variable   - same position, flux changed by > thresh sigma
        moving     - position changed by > thresh sigma (and > MIN_SHIFT_PX)
        only_in_A  - bright in A, undetected in B
        only_in_B  - bright in B, undetected in A
    Filters: sources much sharper than a real PSF (hot pixels, cosmic rays) and
    "moving" pairs a random neighbour could explain are dropped.
    Returns {"candidates": [...], "summary": {...}}."""
    sa = detect_stars(np.where(core, a0, np.nan), DET_SIGMA)
    sb = detect_stars(np.where(core, b0, np.nan), DET_SIGMA)
    if len(sa) < 10 or len(sb) < 10:
        raise ValueError("Too few stars detected to compare the epochs")

    PA_A, PA_B = photometry(a0, rms_a, sa), photometry(b0, rms_b, sa)   # at A positions
    PB_B, PB_A = photometry(b0, rms_b, sb), photometry(a0, rms_a, sb)   # at B positions

    # Stage 1: static matches, used to calibrate k and the systematics
    ia, ib = match_stars(sa, sb, MATCH_PX)
    if len(ia) < 10:
        raise ValueError("Too few matched stars to calibrate the comparison")
    k, s_frac = flux_scale(PA_A[0][ia], PA_A[1][ia], PB_B[0][ib], PB_B[1][ib])

    # Stage 2: wider match among the leftovers (moving objects), flux must agree
    la = np.setdiff1d(np.arange(len(sa)), ia)
    lb = np.setdiff1d(np.arange(len(sb)), ib)
    ia2 = ib2 = np.array([], dtype=int)
    if len(la) and len(lb):
        ja, jb = match_stars(sa[la], sb[lb], maxpm)
        ia2, ib2 = la[ja], lb[jb]
        if len(ia2):
            _, _, sig2 = flux_test(PA_A[0][ia2], PA_A[1][ia2],
                                   PB_B[0][ib2], PB_B[1][ib2], k, s_frac)
            keep = (np.abs(sig2) <= thresh) & (PA_A[0][ia2] / PA_A[1][ia2] > 5)
            ia2, ib2 = ia2[keep], ib2[keep]
    IA, IB = np.r_[ia, ia2], np.r_[ib, ib2]
    oa = np.setdiff1d(np.arange(len(sa)), IA)
    ob = np.setdiff1d(np.arange(len(sb)), IB)

    # Positional test for the matched pairs
    fa, ea, fb, eb = PA_A[0][IA], PA_A[1][IA], PB_B[0][IB], PB_B[1][IB]
    snr_a, snr_b = np.clip(fa / ea, 1, None), np.clip(fb / eb, 1, None)
    d = sb[IB] - sa[IA]
    bright = (np.arange(len(IA)) < len(ia)) & (snr_a > 20) & (snr_b > 20)
    med = np.median(d[bright], axis=0) if bright.sum() >= 10 else np.median(d[:len(ia)], axis=0)
    resid = d - med
    sig_sys = max(float(mad_std(resid[bright])) if bright.sum() >= 10 else 0.1, 0.03)
    sig_pos = np.hypot(FWHM / 2.355 * np.sqrt(1 / snr_a ** 2 + 1 / snr_b ** 2), sig_sys)
    shift = np.hypot(resid[:, 0], resid[:, 1])
    pos_sig = shift / sig_pos
    delta, _, sig_f = flux_test(fa, ea, fb, eb, k, s_frac)

    ref_a, ref_b = frac_reference(PA_A, ia), frac_reference(PB_B, ib)
    density = len(sb) / max(int(core.sum()), 1)       # detections per px^2
    rows, rej_sharp, rej_chance = [], 0, 0

    def add(cls, pa, pb, f_a, e_a, f_b, e_b, sig, dl, sharp_a, sharp_b, **extra):
        nonlocal rej_sharp, rej_chance
        sharp = sharp_a if f_a / e_a >= f_b / e_b else sharp_b   # of the brighter image
        sharp = float(sharp) if np.isfinite(sharp) else 0.0
        if maxsharp > 0 and sharp > maxsharp:
            rej_sharp += 1
            return
        if cls == "moving":
            p = 1 - np.exp(-density * np.pi * extra["shift_px"] ** 2)
            if p > chance:
                rej_chance += 1
                return
            extra["chance_probability"] = float(p)
        rows.append({"class": cls, "x_A": float(pa[0]), "y_A": float(pa[1]),
                     "x_B": float(pb[0]), "y_B": float(pb[1]),
                     "flux_A": float(f_a), "flux_B_scaled": float(k * f_b),
                     "delta_flux": float(dl), "significance_sigma": float(sig),
                     "snr_A": float(f_a / e_a), "snr_B": float(f_b / e_b),
                     "sharpness_ratio": sharp,
                     "score": float(max(abs(sig), extra.get("shift_significance", 0.0))),
                     **extra})

    for i in range(len(IA)):
        moved = pos_sig[i] > thresh and shift[i] > MIN_SHIFT_PX
        if moved or abs(sig_f[i]) > thresh:
            extra = {"shift_px": float(shift[i]), "shift_significance": float(pos_sig[i])}
            add("moving" if moved else "variable", sa[IA[i]], sb[IB[i]],
                fa[i], ea[i], fb[i], eb[i], sig_f[i], delta[i],
                PA_A[2][IA[i]] / ref_a, PB_B[2][IB[i]] / ref_b, **extra)

    # Only in A: own photometry in A, forced photometry in B
    for i in oa:
        f_a, e_a, f_b, e_b = PA_A[0][i], PA_A[1][i], PA_B[0][i], PA_B[1][i]
        dl, _, sig = flux_test(f_a, e_a, f_b, e_b, k, s_frac)
        if f_a / e_a >= 5 and sig > thresh:
            add("only_in_A" if f_b / e_b < 3 else "variable", sa[i], sa[i],
                f_a, e_a, f_b, e_b, sig, dl, PA_A[2][i] / ref_a, np.nan)
    # Only in B: own photometry in B, forced photometry in A
    for i in ob:
        f_b, e_b, f_a, e_a = PB_B[0][i], PB_B[1][i], PB_A[0][i], PB_A[1][i]
        dl, _, sig = flux_test(f_a, e_a, f_b, e_b, k, s_frac)
        if f_b / e_b >= 5 and sig < -thresh:
            add("only_in_B" if f_a / e_a < 3 else "variable", sb[i], sb[i],
                f_a, e_a, f_b, e_b, sig, dl, np.nan, PB_B[2][i] / ref_b)

    rows.sort(key=lambda r: r["score"], reverse=True)
    n_total = len(rows)
    rows = rows[:maxcand]

    # Sky coordinates, magnitude change, proper motion
    scale = float(np.mean(proj_plane_pixel_scales(wcs)) * 3600.0)   # arcsec/px
    if rows:
        ca = wcs.pixel_to_world([r["x_A"] for r in rows], [r["y_A"] for r in rows])
        cb = wcs.pixel_to_world([r["x_B"] for r in rows], [r["y_B"] for r in rows])
        pa_deg = ca.position_angle(cb).deg
    years = abs(days) / 365.25 if days else None
    for n, r in enumerate(rows):
        r["id"] = n + 1
        r["ra_deg"], r["dec_deg"] = round(float(ca[n].ra.deg), 5), round(float(ca[n].dec.deg), 5)
        if r["flux_A"] > 0 and r["flux_B_scaled"] > 0 and min(r["snr_A"], r["snr_B"]) > 3:
            r["delta_mag_B_minus_A"] = round(-2.5 * np.log10(r["flux_B_scaled"] / r["flux_A"]), 2)
        else:
            r["delta_mag_B_minus_A"] = None
        if r["class"] == "moving":
            r["shift_arcsec"] = round(r["shift_px"] * scale, 2)
            r["pm_arcsec_per_yr"] = round(r["shift_arcsec"] / years, 2) if years else None
            r["pm_position_angle_deg"] = round(float(pa_deg[n]), 1)
            if r["pm_arcsec_per_yr"] and r["pm_arcsec_per_yr"] > MAX_STELLAR_PM:
                r["pm_note"] = "exceeds the fastest known stellar proper motion: likely artifact"
        for key, val in list(r.items()):
            if isinstance(val, float):
                r[key] = round(val, 3)

    summary = {
        "stars_detected_A": int(len(sa)), "stars_detected_B": int(len(sb)),
        "stars_matched_static": int(len(ia)), "stars_matched_moving": int(len(ia2)),
        "flux_scale_k": round(k, 4),
        "systematic_flux_error_fraction": round(s_frac, 3),
        "systematic_position_error_px": round(sig_sys, 3),
        "threshold_sigma": thresh,
        "candidates_total": n_total,
        "candidates_listed": len(rows),
        "listed_by_class": {c: sum(r["class"] == c for r in rows) for c in CLASSES},
        "rejected_non_psf_like": int(rej_sharp),
        "rejected_chance_alignment": int(rej_chance),
        "direction_convention": "changes and motion are given from A to B",
    }
    return {"candidates": rows, "summary": summary}


# ---------------------------------------------------------------
# Main function
# ---------------------------------------------------------------
@dataclass
class DifferenceResult:
    """Output of subtract_epochs."""
    a: np.ndarray                 # cutout of A (background not removed)
    b: np.ndarray                 # B reprojected onto A's grid
    a0: np.ndarray                # A minus background
    b0: np.ndarray                # B minus background
    diff: np.ndarray              # A0 - k*B0
    snr: np.ndarray               # (A0 - k*B0) / sigma
    k: float
    sigma: float
    wcs: WCS
    meta: dict
    diff_report: dict
    candidates: list = field(default_factory=list)
    changes_summary: dict | None = None
    changes_error: str | None = None

    def summary(self):
        """JSON-serializable summary (no arrays)."""
        return {"meta": self.meta, "difference_image": self.diff_report,
                "change_detection": self.changes_summary,
                "change_detection_error": self.changes_error,
                "candidates": self.candidates}


def subtract_epochs(source_a, source_b, ra, dec, size=512, scale_mode="auto",
                    thresh=DIFF_THRESH, find_sources=True, maxpm=MAX_PM_PX,
                    maxsharp=MAX_SHARP, chance=MAX_CHANCE, maxcand=MAX_CAND):
    """Subtract two SPHEREx epochs around (ra, dec), in degrees.

    source_a / source_b: URL, local path or BytesIO with an L2 FITS.
    size: cutout side in pixels (~6.15 arcsec/px).
    scale_mode: "auto" fits k (flux B -> A); "none" fixes k = 1.
    find_sources: False does only the pixel subtraction (faster).
    Direction is A -> B. Raises ValueError / FileNotFoundError on invalid data."""
    if scale_mode not in ("auto", "none"):
        raise ValueError("scale_mode must be 'auto' or 'none'")
    src_a, src_b = resolve(source_a), resolve(source_b)
    a, b, wcs = align_images(src_a, src_b, ra, dec, size, return_wcs=True)
    if not np.isfinite(a).any() or not np.isfinite(b).any():
        raise ValueError("No valid pixels: the images do not overlap in this area")

    mjd_a, mjd_b = read_mjd(src_a), read_mjd(src_b)
    days = None if mjd_a is None or mjd_b is None else round(mjd_b - mjd_a, 1)
    wave_a, wave_b = wavelength_at(src_a, ra, dec), wavelength_at(src_b, ra, dec)
    meta = {
        "source_a": _label(source_a), "source_b": _label(source_b),
        "ra": ra, "dec": dec, "size": size,
        "mjd_a": None if mjd_a is None else round(mjd_a, 2),
        "mjd_b": None if mjd_b is None else round(mjd_b, 2),
        "days_between": days,
        "wave_a": wave_a, "wave_b": wave_b,
        "wavelength": compare_wavelengths(wave_a, wave_b),
        "arcsec_per_pixel": round(float(np.mean(proj_plane_pixel_scales(wcs)) * 3600.0), 3),
    }

    a0, b0, rms_a, rms_b, core = prepare(a, b)
    d = difference_image(a0, b0, core, rms_a, rms_b, scale_mode, thresh)
    result = DifferenceResult(a=a, b=b, a0=a0, b0=b0, diff=d["diff"], snr=d["snr"],
                              k=d["k"], sigma=d["sigma"], wcs=wcs, meta=meta,
                              diff_report=d["report"])
    if find_sources:
        try:
            ch = find_changes(a0, b0, rms_a, rms_b, core, wcs, days,
                              thresh, maxpm, maxsharp, chance, maxcand)
            result.candidates, result.changes_summary = ch["candidates"], ch["summary"]
        except Exception as e:      # the subtraction itself is still valid
            result.changes_error = str(e)
    return result


# ---------------------------------------------------------------
# Output for the frontend
# ---------------------------------------------------------------
def difference_fits(result):
    """In-memory FITS with DIFF and SNR extensions (with WCS). Optional download."""
    header = result.wcs.to_header(relax=True)
    header["K_SCALE"] = (result.k, "flux scale applied to B")
    header["SIGMA_D"] = (result.sigma, "robust sigma of the difference")
    header["BKGMODEL"] = ("2D mesh 64px", "background removed from A and B")
    if result.meta["mjd_a"] is not None:
        header["MJD_A"] = result.meta["mjd_a"]
    if result.meta["mjd_b"] is not None:
        header["MJD_B"] = result.meta["mjd_b"]
    hdul = fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(result.diff.astype("float32"), header=header, name="DIFF"),
        fits.ImageHDU(result.snr.astype("float32"), header=header, name="SNR"),
    ])
    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


def valid_box(snr, min_valid=0.995):
    """Rectangle (x0, x1, y0, y1) that is almost entirely valid data.

    Starts from the box containing every finite pixel and drops the edge with
    the most NaN until >= min_valid of the box is valid. This removes the black
    strips at the borders, including the tilted ones from the rotation."""
    ok = np.isfinite(snr)
    if not ok.any():
        raise ValueError("No valid pixels in the difference image")
    ys, xs = np.where(ok)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    while (x1 - x0) > 16 and (y1 - y0) > 16 and ok[y0:y1, x0:x1].mean() < min_valid:
        box = ok[y0:y1, x0:x1]
        bad = {"left": (~box[:, 0]).sum(), "right": (~box[:, -1]).sum(),
               "bottom": (~box[0, :]).sum(), "top": (~box[-1, :]).sum()}
        side = max(bad, key=bad.get)
        if side == "left":
            x0 += 1
        elif side == "right":
            x1 -= 1
        elif side == "bottom":
            y0 += 1
        else:
            y1 -= 1
    return int(x0), int(x1), int(y0), int(y1)


def render_difference_png(result, diff_range=5.0, markers=True, crop=True, target_px=800):
    """PNG of the (A - k*B)/sigma map, cropped to valid data, markers drawn.

    Red = A brighter, blue = B brighter. The image is just the map (no axes or
    colorbar) so the frontend can show it directly. matplotlib is imported here
    so the rest of the module does not need it."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    snr = result.snr
    x0, x1, y0, y1 = valid_box(snr) if crop else (0, snr.shape[1], 0, snr.shape[0])
    view = snr[y0:y1, x0:x1]
    h, w = view.shape
    scale = max(1, target_px // max(h, w))
    fig = plt.figure(figsize=(w * scale / 100, h * scale / 100), dpi=100, facecolor="black")
    ax = fig.add_axes([0, 0, 1, 1])
    cmap = plt.get_cmap("RdBu_r").copy()
    cmap.set_bad("#1a1a1a")
    ax.imshow(view, origin="lower", cmap=cmap, vmin=-diff_range, vmax=diff_range,
              interpolation="nearest")
    ax.axis("off")
    if markers:
        for c in result.candidates:
            xa, ya = c["x_A"] - x0, c["y_A"] - y0
            xb, yb = c["x_B"] - x0, c["y_B"] - y0
            if not (0 <= xb < w and 0 <= yb < h):
                continue
            shape, color = MARKER_STYLE[c["class"]]
            ax.scatter([xb], [yb], s=170, marker=shape, facecolors="none",
                       edgecolors=color, linewidths=1.2)
            ax.text(xb + 6, yb + 6, str(c["id"]), color=color, fontsize=8)
            if c["class"] == "moving":
                ax.annotate("", xy=(xb, yb), xytext=(xa, ya),
                            arrowprops=dict(arrowstyle="->", color=color, lw=1.2))
    ax.set_xlim(-0.5, w - 0.5)
    ax.set_ylim(-0.5, h - 0.5)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, facecolor="black")
    plt.close(fig)
    return buf.getvalue()


def subtract_to_png(source_a, source_b, ra, dec, size=512, **kwargs):
    """One call for the "Hacer Resta" button: returns (png_bytes, summary_dict).

    kwargs go to subtract_epochs (scale_mode, thresh, maxpm, maxsharp, ...)."""
    result = subtract_epochs(source_a, source_b, ra, dec, size, **kwargs)
    return render_difference_png(result), result.summary()