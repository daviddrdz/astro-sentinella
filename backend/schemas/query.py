import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date

import astropy.units as u
from astropy.coordinates import Angle

VALID_RENDER_COLORS = ("grey", "viridis", "magma", "inferno", "cividis", "cubehelix")
VALID_RENDER_BANDS = tuple(range(1, 7))

class QueryValidationError(ValueError):
    pass


@dataclass(frozen=True)
class Coordinates:
    ra_deg: float
    dec_deg: float


@dataclass(frozen=True)
class SkyImageQuery:
    ra_deg: float
    dec_deg: float
    observation_date: date
    field_size_deg: float = 0.05
    color: str = "magma"
    bands: tuple[int, ...] = ()
    detectors: tuple[int, ...] = ()


def _required(args: Mapping[str, str], name: str) -> str:
    value = (args.get(name) or "").strip()
    if not value:
        raise QueryValidationError(f"'{name}' is required.")
    return value


def _parse_angle_deg(text: str, sexagesimal_unit: u.UnitBase, name: str) -> float:
    try:
        degrees = float(text)
    except ValueError:
        try:
            degrees = Angle(text, unit=sexagesimal_unit).degree
        except (ValueError, u.UnitsError):
            raise QueryValidationError(f"'{name}' is not a valid angle.") from None

    if not math.isfinite(degrees):
        raise QueryValidationError(f"'{name}' is not a valid angle.")
    return float(degrees)


def parse_coordinates(args: Mapping[str, str]) -> Coordinates:
    ra_deg = _parse_angle_deg(_required(args, "ra"), u.hourangle, "ra")
    dec_deg = _parse_angle_deg(_required(args, "dec"), u.deg, "dec")

    if not 0 <= ra_deg < 360:
        raise QueryValidationError("'ra' must be in [0, 360) degrees.")
    if not -90 <= dec_deg <= 90:
        raise QueryValidationError("'dec' must be in [-90, 90] degrees.")

    return Coordinates(ra_deg, dec_deg)


def parse_field_size_deg(args: Mapping[str, str], default: float = 0.05) -> float:
    raw = (args.get("fieldSizeDeg") or "").strip()
    if not raw:
        return default
    cleaned = raw.removesuffix("deg").strip()
    try:
        size = float(cleaned)
    except ValueError:
        raise QueryValidationError("'fieldSizeDeg' must be a number in degrees.") from None

    if not math.isfinite(size) or not (0.01 <= size <= 10.0):
        raise QueryValidationError("'fieldSizeDeg' must be between 0.01 and 10 degrees.")
    return size


def parse_sky_image_query(args: Mapping[str, str]) -> SkyImageQuery:
    coords = parse_coordinates(args)
    try:
        observation_date = date.fromisoformat(_required(args, "observationDate"))
    except ValueError:
        raise QueryValidationError(
            "'observationDate' must be a date in YYYY-MM-DD format."
        ) from None

    field_size_deg = parse_field_size_deg(args)
    color = (args.get("color") or "magma").strip()
    if color not in VALID_RENDER_COLORS:
        raise QueryValidationError(
            f"'color' must be one of: {', '.join(VALID_RENDER_COLORS)}."
        )

    raw_bands = (args.get("detectors") or args.get("bands") or args.get("detector") or "").strip()
    if raw_bands:
        try:
            bands = tuple(int(value.strip()) for value in raw_bands.split(","))
        except ValueError:
            raise QueryValidationError("'detectors' must be a comma-separated list of integers.") from None
        if not bands or any(band not in VALID_RENDER_BANDS for band in bands):
            raise QueryValidationError("'detectors' must contain values from 1 to 6.")
        if len(set(bands)) != len(bands):
            raise QueryValidationError("'detectors' must not contain duplicate values.")
    else:
        bands = ()

    return SkyImageQuery(
        coords.ra_deg,
        coords.dec_deg,
        observation_date,
        field_size_deg,
        color,
        bands,
        bands,
    )
