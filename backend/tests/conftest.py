import pytest

from app import limiter
from services.frames_service import FITS_CACHE, PNG_CACHE
from services.irsa_archive import SEARCH_CACHE

@pytest.fixture(autouse=True)
def reset_state():
    limiter.reset(); SEARCH_CACHE.clear(); FITS_CACHE.clear(); PNG_CACHE.clear()
    yield
    limiter.reset(); SEARCH_CACHE.clear(); FITS_CACHE.clear(); PNG_CACHE.clear()
