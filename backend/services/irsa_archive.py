import logging
import time
from collections.abc import Callable
from services.cache import TTLCache
from typing import TypeVar

from astropy.table import Table
from pyvo.dal import DALQueryError, DALServiceError, SIA2Service

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTION = "spherex_dr1"
SEARCH_RADIUS_DEG = 0.01
MAX_RETRIES = 3
RETRY_BACKOFF_S = 1.0
SEARCH_CACHE = TTLCache(ttl_s=600, max_items=64)

logger = logging.getLogger(__name__)
T = TypeVar("T")


class ArchiveUnavailableError(Exception):
    pass


def with_retries(
    operation: Callable[[], T],
    retryable: tuple[type[BaseException], ...],
    description: str,
) -> T:
    for attempt in range(MAX_RETRIES + 1):
        try:
            return operation()
        except retryable as exc:
            if attempt == MAX_RETRIES:
                raise
            delay = RETRY_BACKOFF_S * 2**attempt
            logger.warning(
                "%s failed (attempt %d/%d): %s; retrying in %.1fs",
                description, attempt + 1, MAX_RETRIES + 1, exc, delay,
            )
            time.sleep(delay)
    raise AssertionError("unreachable")


def _query_images(ra_deg: float, dec_deg: float) -> Table:
    return (
        SIA2Service(SIA_URL)
        .search(pos=(ra_deg, dec_deg, SEARCH_RADIUS_DEG), collection=COLLECTION)
        .to_table()
    )


def search_images(ra_deg: float, dec_deg: float) -> Table:
    def compute():
        try:
            return with_retries(
                lambda: _query_images(ra_deg, dec_deg),
                (DALServiceError,),
                "Image archive query",
            )
        except (DALServiceError, DALQueryError) as exc:
            raise ArchiveUnavailableError("Image archive query failed.") from exc

    return SEARCH_CACHE.get_or_compute((round(ra_deg, 4), round(dec_deg, 4)), compute)
