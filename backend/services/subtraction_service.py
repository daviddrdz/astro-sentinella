from datetime import date

from services.frames_service import ImageNotFoundError, select_image_url_for_date
from services.irsa_archive import ArchiveUnavailableError, search_images


def subtract_observations(
    ra: float,
    dec: float,
    observation_date_a: date,
    observation_date_b: date,
    detector: int,
    size: int,
    options: dict,
) -> tuple[bytes, dict]:
    table = search_images(ra, dec)
    source_a = select_image_url_for_date(table, observation_date_a, detector)
    source_b = select_image_url_for_date(table, observation_date_b, detector)
    if source_a is None:
        raise ImageNotFoundError(
            f"No detector D{detector} image found on {observation_date_a.isoformat()}."
        )
    if source_b is None:
        raise ImageNotFoundError(
            f"No detector D{detector} image found on {observation_date_b.isoformat()}."
        )

    from substraction import subtract_to_png

    try:
        return subtract_to_png(source_a, source_b, ra, dec, size, **options)
    except OSError as exc:
        raise ArchiveUnavailableError("Subtraction image download failed.") from exc

