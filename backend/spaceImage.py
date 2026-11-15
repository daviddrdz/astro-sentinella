import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
from astropy.nddata import Cutout2D
import astropy.units as u
from reproject import reproject_interp
from photutils.background import Background2D, MedianBackground


def open_fits_image(fits_source):
    """
    Open a FITS image accepting either a file path (str/Path) or an in-memory buffer (BytesIO).
    """
    with fits.open(fits_source, memmap=False) as hdul:
        if len(hdul) < 2 or hdul[1].data is None:
            raise ValueError("The FITS file does not have a valid image extension at index [1].")
        data = np.asarray(hdul[1].data, dtype=float)
        wcs = WCS(hdul[1].header)
        
    if data.ndim != 2:
        raise ValueError(f"The image must be two-dimensional (found {data.ndim} dimensions).")
        
    data[~np.isfinite(data)] = np.nan
    return data, wcs


def remove_background(img, box=64):
    """
    Remove 2D background using photutils, with a fallback to global median.
    
    Parameters:
        img (np.ndarray): 2D image array.
        box (int): Box size for Background2D.
        
    Returns:
        np.ndarray: Background-subtracted image.
    """
    mask = ~np.isfinite(img)
    try:
        if mask.all():
            return img
            
        bkg = Background2D(
            np.where(mask, 0.0, img), 
            box_size=box, 
            filter_size=3,
            coverage_mask=mask, 
            fill_value=0.0,
            exclude_percentile=50.0, 
            bkg_estimator=MedianBackground()
        )
        return img - bkg.background
    except Exception:
        # Safe fallback if 2D estimation fails
        return img - np.nanmedian(img)


def align_images(source_a, source_b, ra, dec, size):
    """
    Crop image A around (ra, dec) and reproject image B onto that exact WCS grid.
    
    Parameters:
        source_a, source_b: File paths (str/Path) or in-memory buffers.
        ra (float): Right Ascension in degrees.
        dec (float): Declination in degrees.
        size (int): Cutout size in pixels.
        
    Returns:
        tuple: (cutout_data_a, b_aligned) as 2D NumPy arrays.
    """
    if size <= 0:
        raise ValueError("Size must be greater than zero.")

    # 1. Open both images
    data_a, wcs_a = open_fits_image(source_a)
    data_b, wcs_b = open_fits_image(source_b)

    # 2. Define cutout celestial position
    pos = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs")
    
    # 3. Perform cutout on A
    cutout = Cutout2D(
        data_a, 
        pos, 
        size=u.Quantity((size, size), u.pixel),
        wcs=wcs_a, 
        mode="partial", 
        fill_value=np.nan
    )
    
    # 4. Reproject B onto A's cutout grid
    b_aligned, _ = reproject_interp(
        (data_b, wcs_b), 
        cutout.wcs, 
        shape_out=cutout.data.shape
    )
    
    return cutout.data, b_aligned