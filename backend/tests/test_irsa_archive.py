import pytest
from astropy.table import Table
from pyvo.dal import DALQueryError, DALServiceError

from services import irsa_archive
from services.irsa_archive import ArchiveUnavailableError, search_images


@pytest.fixture
def no_sleep(monkeypatch):
    sleeps = []
    monkeypatch.setattr(irsa_archive.time, "sleep", sleeps.append)
    return sleeps


def test_search_retries_transient_failures(monkeypatch, no_sleep):
    attempts = []
    table = Table({"t_min": [60800.0]})

    def flaky(ra, dec):
        attempts.append(1)
        if len(attempts) < 3:
            raise DALServiceError("502 Proxy Error")
        return table

    monkeypatch.setattr(irsa_archive, "_query_images", flaky)

    assert search_images(1.0, 2.0) is table
    assert len(attempts) == 3
    assert no_sleep == [1.0, 2.0]


def test_search_gives_up_after_three_retries(monkeypatch, no_sleep):
    attempts = []

    def always_fails(ra, dec):
        attempts.append(1)
        raise DALServiceError("502 Proxy Error")

    monkeypatch.setattr(irsa_archive, "_query_images", always_fails)
    with pytest.raises(ArchiveUnavailableError):
        search_images(1.0, 2.0)

    assert len(attempts) == 1 + irsa_archive.MAX_RETRIES
    assert no_sleep == [1.0, 2.0, 4.0]


def test_rejected_queries_are_not_retried(monkeypatch, no_sleep):
    attempts = []

    def rejected(ra, dec):
        attempts.append(1)
        raise DALQueryError("bad query")

    monkeypatch.setattr(irsa_archive, "_query_images", rejected)
    with pytest.raises(ArchiveUnavailableError):
        search_images(1.0, 2.0)

    assert len(attempts) == 1
    assert no_sleep == []
