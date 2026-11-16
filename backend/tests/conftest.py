import pytest

from app import limiter
from services.fits_remote import LAYOUT_CACHE
from services.frames_service import FRAME_GEOMETRY_CACHE, PNG_CACHE
from services.hips_cube import SCAN_CACHE
from services.irsa_archive import SEARCH_CACHE
from services.level2_spectrum import SPECTRUM_CACHE, WAVE_GRID_CACHE, WCS_CACHE
from services.spectrum_service import FIELD_CUBE_CACHE

ALL_CACHES = (
    SEARCH_CACHE,
    PNG_CACHE,
    LAYOUT_CACHE,
    SCAN_CACHE,
    SPECTRUM_CACHE,
    WAVE_GRID_CACHE,
    WCS_CACHE,
    FIELD_CUBE_CACHE,
    FRAME_GEOMETRY_CACHE,
)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    # Rendering a frame kicks off a background cube download; never let tests hit the network.
    monkeypatch.setattr("routes.frames.prefetch_field_cube", lambda *_: None)
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()
    yield
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()
