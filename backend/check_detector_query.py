"""Inspect the SIA2 detector files available for one SPHEREx observation date."""

import argparse
import re
from datetime import date

import astropy.units as u
from astropy.coordinates import Angle
from astropy.table import Table
from astropy.time import Time
from pyvo.dal import SIA2Service

SIA_URL = "https://irsa.ipac.caltech.edu/SIA?"
COLLECTION = "spherex_dr1"
SEARCH_RADIUS_DEG = 0.01


def parse_angle(value: str, unit: u.UnitBase) -> float:
    try:
        return float(value)
    except ValueError:
        return float(Angle(value, unit=unit).degree)


def detector_number(value: object) -> int | None:
    match = re.search(r"(?:SPHEREX-)?D([1-6])\b", str(value).upper())
    return int(match.group(1)) if match else None


def rows_on_date(table: Table, observation_date: date) -> list[int]:
    day_start = Time(observation_date.isoformat(), scale="utc").mjd
    t_min = table["t_min"]
    return [
        index
        for index, value in enumerate(t_min)
        if day_start <= float(value) < day_start + 1
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ra", required=True, help="RA in decimal degrees or sexagesimal")
    parser.add_argument("--dec", required=True, help="Dec in decimal degrees or sexagesimal")
    parser.add_argument("--date", required=True, type=date.fromisoformat)
    args = parser.parse_args()

    ra_deg = parse_angle(args.ra, u.hourangle)
    dec_deg = parse_angle(args.dec, u.deg)
    table = (
        SIA2Service(SIA_URL)
        .search(
            pos=(ra_deg, dec_deg, SEARCH_RADIUS_DEG),
            collection=COLLECTION,
        )
        .to_table()
    )

    print(f"Query: RA={ra_deg:.8f} deg, Dec={dec_deg:.8f} deg")
    print(f"Rows returned by SIA2: {len(table)}")
    print(f"Columns: {', '.join(table.colnames)}")

    date_rows = rows_on_date(table, args.date)
    grouped: dict[int, list[int]] = {}
    for row_index in date_rows:
        detector = detector_number(table["energy_bandpassname"][row_index])
        if detector is not None:
            grouped.setdefault(detector, []).append(row_index)

    print(f"Rows on {args.date.isoformat()}: {len(date_rows)}")
    print(f"Detectors on date: {', '.join(f'D{key}' for key in sorted(grouped)) or 'none'}")
    for detector in sorted(grouped):
        row_index = min(grouped[detector], key=lambda index: float(table["t_min"][index]))
        print(
            f"D{detector}: rows={len(grouped[detector])}, "
            f"t_min_mjd={float(table['t_min'][row_index]):.6f}, "
            f"url={table['access_url'][row_index]}"
        )


if __name__ == "__main__":
    main()
