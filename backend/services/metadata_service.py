from collections import Counter

import numpy as np
from astropy.table import Table
from astropy.time import Time

from schemas.metadata import CoordinateMetadata
from services.irsa_archive import COLLECTION, search_images

DEFAULT_INSTRUMENT = "SPHEREx"


def _column_strings(table: Table, name: str) -> list[str]:
    if name not in table.colnames:
        return []
    values = (str(v).strip() for v in np.ma.filled(table[name].astype(str), ""))
    return [v for v in values if v and v != "--"]


def _observation_dates(table: Table) -> list[str]:
    """Distinct UTC dates (YYYY-MM-DD) of the images' t_min, which is in MJD."""
    if "t_min" not in table.colnames:
        return []
    mjd = np.ma.filled(np.ma.asarray(table["t_min"], dtype=float), np.nan)
    mjd = mjd[np.isfinite(mjd)]
    if mjd.size == 0:
        return []
    return sorted({dt.date().isoformat() for dt in Time(mjd, format="mjd").to_datetime()})


def build_metadata(table: Table, ra_deg: float, dec_deg: float) -> CoordinateMetadata:
    dates = _observation_dates(table)
    targets = Counter(_column_strings(table, "target_name"))
    instruments = Counter(_column_strings(table, "instrument_name"))

    return CoordinateMetadata(
        target_name=(
            targets.most_common(1)[0][0] if targets else f"RA {ra_deg:.4f}° Dec {dec_deg:+.4f}°"
        ),
        catalog_id=COLLECTION,
        instrument=instruments.most_common(1)[0][0] if instruments else DEFAULT_INSTRUMENT,
        available_bands=sorted(set(_column_strings(table, "energy_bandpassname"))),
        available_dates=dates,
        frame_count=len(table),
        observation_window=f"{dates[0]} – {dates[-1]}" if dates else "",
    )


def get_coordinate_metadata(ra_deg: float, dec_deg: float) -> CoordinateMetadata:
    return build_metadata(search_images(ra_deg, dec_deg), ra_deg, dec_deg)
