import pytest

from app import limiter
from services.fits_remote import LAYOUT_CACHE
from services.frames_service import PNG_CACHE
from services.irsa_archive import SEARCH_CACHE
from services.level2_spectrum import SPECTRUM_CACHE, WAVE_GRID_CACHE, WCS_CACHE

ALL_CACHES = (SEARCH_CACHE, PNG_CACHE, LAYOUT_CACHE, SPECTRUM_CACHE, WAVE_GRID_CACHE, WCS_CACHE)


@pytest.fixture(autouse=True)
def reset_state():
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()
    yield
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()
