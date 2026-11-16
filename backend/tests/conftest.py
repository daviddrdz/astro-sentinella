import pytest

from app import app, limiter
from services.fits_remote import LAYOUT_CACHE
from services.frames_service import FITS_CACHE, FRAME_GEOMETRY_CACHE, PNG_CACHE
from services.hips_cube import SCAN_CACHE
from services.irsa_archive import SEARCH_CACHE
from services.level2_spectrum import SPECTRUM_CACHE, WAVE_GRID_CACHE, WCS_CACHE
from services.spectrum_service import FIELD_CUBE_CACHE

ALL_CACHES = (
    SEARCH_CACHE,
    PNG_CACHE,
    FITS_CACHE,
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
    monkeypatch.setitem(app.config, "TESTING", True)
    # Rendering a frame kicks off a background cube download; never let tests hit the network.
    monkeypatch.setattr("routes.frames.prefetch_field_cube", lambda *_: None)
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()
    yield
    limiter.reset()
    for cache in ALL_CACHES:
        cache.clear()

@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Fail immediately if a test accidentally contacts an external service."""
    def blocked(*args, **kwargs):
        pytest.fail("Unexpected network access; mock the archive or image download")

    monkeypatch.setattr("socket.create_connection", blocked)
    monkeypatch.setattr("socket.socket.connect", blocked)


@pytest.fixture
def client():
    return app.test_client()
