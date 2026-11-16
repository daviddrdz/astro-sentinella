import pytest

from app import limiter
from services.frames_service import PNG_CACHE
from services.spectrum_service import FIELD_CUBE_CACHE, FRAME_GEOMETRY_CACHE
from services.irsa_archive import SEARCH_CACHE

@pytest.fixture(autouse=True)
def reset_state():
    limiter.reset(); SEARCH_CACHE.clear(); PNG_CACHE.clear()
    FRAME_GEOMETRY_CACHE.clear(); FIELD_CUBE_CACHE.clear()
    yield
    limiter.reset(); SEARCH_CACHE.clear(); PNG_CACHE.clear()
    FRAME_GEOMETRY_CACHE.clear(); FIELD_CUBE_CACHE.clear()
