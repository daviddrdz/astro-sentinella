from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import Mock

import pytest

from services.cache import TTLCache


@pytest.mark.parametrize("value", [None, False, 0, [], ""])
def test_cache_reuses_falsy_results(value):
    cache = TTLCache(60, 2)
    compute = Mock(return_value=value)
    assert cache.get_or_compute("key", compute) is value
    assert cache.get_or_compute("key", compute) is value
    compute.assert_called_once()


def test_cache_expires_at_ttl(monkeypatch):
    clock = Mock(return_value=100)
    monkeypatch.setattr("services.cache.time.monotonic", clock)
    cache = TTLCache(10, 2)
    compute = Mock(side_effect=["first", "second"])
    assert cache.get_or_compute("key", compute) == "first"
    clock.return_value = 109
    assert cache.get_or_compute("key", compute) == "first"
    clock.return_value = 110
    assert cache.get_or_compute("key", compute) == "second"
    assert compute.call_count == 2


def test_cache_evicts_least_recently_used():
    cache = TTLCache(60, 2)
    cache.get_or_compute("a", lambda: "a")
    cache.get_or_compute("b", lambda: "b")
    cache.get_or_compute("a", lambda: pytest.fail("a should be cached"))
    cache.get_or_compute("c", lambda: "c")
    assert cache.get_or_compute("b", lambda: "new b") == "new b"


def test_failures_are_not_cached_and_clear_forces_recompute():
    cache = TTLCache(60, 2)
    compute = Mock(side_effect=[ValueError("failed"), 1, 2])
    with pytest.raises(ValueError, match="failed"):
        cache.get_or_compute("key", compute)
    assert cache.get_or_compute("key", compute) == 1
    cache.clear()
    assert cache.get_or_compute("key", compute) == 2


def test_concurrent_requests_compute_once():
    cache = TTLCache(60, 2)
    entered, release = Event(), Event()

    def compute():
        entered.set()
        assert release.wait(5)
        return object()

    operation = Mock(side_effect=compute)
    with ThreadPoolExecutor(max_workers=4) as pool:
        first = pool.submit(cache.get_or_compute, "key", operation)
        try:
            assert entered.wait(5)
            others = [pool.submit(cache.get_or_compute, "key", operation) for _ in range(3)]
        finally:
            release.set()
        result = first.result(timeout=5)
        assert all(future.result(timeout=5) is result for future in others)
    operation.assert_called_once()
