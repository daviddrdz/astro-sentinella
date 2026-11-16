from unittest.mock import Mock, call

import pytest
from astropy.table import Table
from pyvo.dal import DALQueryError, DALServiceError

from services import irsa_archive as archive


@pytest.fixture
def sleep(monkeypatch):
    mock = Mock()
    monkeypatch.setattr(archive.time, "sleep", mock)
    return mock


def test_provider_query_uses_expected_collection_and_search_radius(monkeypatch):
    table = Table()
    service = Mock()
    service.search.return_value.to_table.return_value = table
    factory = Mock(return_value=service)
    monkeypatch.setattr(archive, "SIA2Service", factory)
    assert archive._query_images(1, 2) is table
    factory.assert_called_once_with(archive.SIA_URL)
    service.search.assert_called_once_with(pos=(1, 2, 0.01), collection="spherex_dr1")


def test_archive_recovers_from_transient_failures(monkeypatch, sleep):
    table = Table()
    query = Mock(side_effect=[DALServiceError("unavailable"), DALServiceError("timeout"), table])
    monkeypatch.setattr(archive, "_query_images", query)
    assert archive.search_images(1, 2) is table
    assert query.call_count == 3
    assert sleep.call_args_list == [call(1), call(2)]


def test_exhausted_retries_wrap_error_and_failure_is_not_cached(monkeypatch, sleep):
    query = Mock(side_effect=DALServiceError("private detail"))
    monkeypatch.setattr(archive, "_query_images", query)
    with pytest.raises(archive.ArchiveUnavailableError) as error:
        archive.search_images(1, 2)
    assert isinstance(error.value.__cause__, DALServiceError)
    assert query.call_count == 4
    assert sleep.call_args_list == [call(1), call(2), call(4)]
    query.side_effect = None
    query.return_value = Table()
    assert archive.search_images(1, 2) is query.return_value
    assert query.call_count == 5


def test_rejected_queries_are_not_retried(monkeypatch, sleep):
    query = Mock(side_effect=DALQueryError("bad query"))
    monkeypatch.setattr(archive, "_query_images", query)
    with pytest.raises(archive.ArchiveUnavailableError):
        archive.search_images(1, 2)
    query.assert_called_once_with(1, 2)
    sleep.assert_not_called()


def test_archive_cache_reuses_coordinates_but_separates_positions(monkeypatch):
    first, second = Table(), Table()
    query = Mock(side_effect=[first, second])
    monkeypatch.setattr(archive, "_query_images", query)
    assert archive.search_images(1, 2) is first
    assert archive.search_images(1, 2) is first
    assert archive.search_images(3, 2) is second
    assert query.call_args_list == [call(1, 2), call(3, 2)]


def test_unexpected_errors_are_not_retried(sleep):
    operation = Mock(side_effect=ValueError("programming error"))
    with pytest.raises(ValueError, match="programming error"):
        archive.with_retries(operation, (OSError,), "test")
    operation.assert_called_once()
    sleep.assert_not_called()
