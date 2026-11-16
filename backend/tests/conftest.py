import pytest

from app import app, limiter
from services.frames_service import PNG_CACHE
from services.irsa_archive import SEARCH_CACHE


@pytest.fixture(autouse=True)
def isolated_state(monkeypatch):
    monkeypatch.setitem(app.config, "TESTING", True)
    limiter.reset()
    SEARCH_CACHE.clear()
    PNG_CACHE.clear()
    yield
    limiter.reset()
    SEARCH_CACHE.clear()
    PNG_CACHE.clear()


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
