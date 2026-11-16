import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date

from schemas.query import QueryValidationError, parse_coordinates


class SubtractionValidationError(ValueError):
    pass


@dataclass(frozen=True)
class SubtractionQuery:
    ra_deg: float
    dec_deg: float
    observation_date_a: date
    observation_date_b: date
    detector: int
    size: int
    options: dict[str, float | int | bool | str]


def _integer(params: Mapping[str, object], name: str, default: int,
             minimum: int, maximum: int) -> int:
    raw = params.get(name, default)
    if isinstance(raw, bool):
        raise SubtractionValidationError(f"'{name}' must be an integer.")
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, str) and re.fullmatch(r"[+-]?\d+", raw.strip()):
        value = int(raw)
    else:
        raise SubtractionValidationError(f"'{name}' must be an integer.")
    if not minimum <= value <= maximum:
        raise SubtractionValidationError(
            f"'{name}' must be between {minimum} and {maximum}."
        )
    return value


def _number(params: Mapping[str, object], name: str,
            minimum: float, maximum: float) -> float | None:
    if name not in params:
        return None
    raw = params[name]
    if isinstance(raw, bool):
        raise SubtractionValidationError(f"'{name}' must be a number.")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise SubtractionValidationError(f"'{name}' must be a number.") from None
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise SubtractionValidationError(
            f"'{name}' must be between {minimum:g} and {maximum:g}."
        )
    return value


def _boolean(params: Mapping[str, object], name: str) -> bool | None:
    if name not in params:
        return None
    raw = params[name]
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in ("true", "1", "yes", "on"):
            return True
        if value in ("false", "0", "no", "off"):
            return False
    raise SubtractionValidationError(f"'{name}' must be a boolean.")


def _observation_date(params: Mapping[str, object], name: str) -> date:
    raw = params.get(name)
    if not isinstance(raw, str):
        raise SubtractionValidationError(f"'{name}' must be a date in YYYY-MM-DD format.")
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise SubtractionValidationError(
            f"'{name}' must be a date in YYYY-MM-DD format."
        ) from None
    if parsed.isoformat() != raw:
        raise SubtractionValidationError(f"'{name}' must be a date in YYYY-MM-DD format.")
    return parsed


def parse_subtraction_query(params: Mapping[str, object]) -> SubtractionQuery:
    coordinate_values = {}
    for name in ("ra", "dec"):
        raw = params.get(name)
        if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
            raise SubtractionValidationError(f"'{name}' is required and must be an angle.")
        coordinate_values[name] = str(raw)
    try:
        coords = parse_coordinates(coordinate_values)
    except QueryValidationError as exc:
        raise SubtractionValidationError(str(exc)) from None

    observation_date_a = _observation_date(params, "observationDateA")
    observation_date_b = _observation_date(params, "observationDateB")
    if observation_date_a == observation_date_b:
        raise SubtractionValidationError("'observationDateA' and 'observationDateB' must differ.")

    scale_mode = params.get("scaleMode", "auto")
    if not isinstance(scale_mode, str) or scale_mode not in ("auto", "none"):
        raise SubtractionValidationError("'scaleMode' must be 'auto' or 'none'.")

    options: dict[str, float | int | bool | str] = {"scale_mode": scale_mode}
    for name, minimum, maximum in (
        ("thresh", 0.1, 50.0),
        ("maxpm", 0.1, 100.0),
        ("maxsharp", 0.0, 10.0),
        ("chance", 0.0, 1.0),
    ):
        value = _number(params, name, minimum, maximum)
        if value is not None:
            options[name] = value
    find_sources = _boolean(params, "findSources")
    if find_sources is not None:
        options["find_sources"] = find_sources
    max_candidates = _integer(params, "maxcand", 50, 0, 50)
    if "maxcand" in params:
        options["maxcand"] = max_candidates

    if "detector" not in params:
        raise SubtractionValidationError("'detector' is required.")

    return SubtractionQuery(
        ra_deg=coords.ra_deg,
        dec_deg=coords.dec_deg,
        observation_date_a=observation_date_a,
        observation_date_b=observation_date_b,
        detector=_integer(params, "detector", 1, 1, 6),
        size=_integer(params, "size", 512, 16, 2048),
        options=options,
    )
