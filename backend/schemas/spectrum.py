import math
from collections.abc import Mapping
from dataclasses import dataclass

from schemas.query import QueryValidationError, SkyImageQuery, parse_sky_image_query


@dataclass(frozen=True)
class ChunkSpectrumQuery:
    """A click on the rendered frame, as a fraction of the image width/height.

    ``x`` grows left to right and ``y`` grows top to bottom, both in [0, 1].
    """

    sky: SkyImageQuery
    x: float
    y: float


def _parse_fraction(args: Mapping[str, str], name: str) -> float:
    raw = (args.get(name) or "").strip()
    if not raw:
        raise QueryValidationError(f"'{name}' is required.")
    try:
        value = float(raw)
    except ValueError:
        raise QueryValidationError(f"'{name}' must be a number between 0 and 1.") from None
    if not math.isfinite(value) or not 0.0 <= value <= 1.0:
        raise QueryValidationError(f"'{name}' must be a number between 0 and 1.")
    return value


def parse_chunk_spectrum_query(args: Mapping[str, str]) -> ChunkSpectrumQuery:
    return ChunkSpectrumQuery(
        sky=parse_sky_image_query(args),
        x=_parse_fraction(args, "x"),
        y=_parse_fraction(args, "y"),
    )
