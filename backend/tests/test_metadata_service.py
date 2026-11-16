import numpy as np
from astropy.table import MaskedColumn, Table
from astropy.time import Time
from unittest.mock import Mock

from services import metadata_service as metadata


def test_metadata_aggregates_dates_bands_and_most_common_names():
    start = Time("2025-05-01").mjd
    table = Table({
        "t_min": MaskedColumn([start + 2, start, start + 0.5, np.nan, start + 10],
                              mask=[False, False, False, False, True]),
        "target_name": [" Orion ", "Orion", "Other", "", "--"],
        "instrument_name": ["SPHEREx", "SPHEREx", "Other", "", "--"],
        "energy_bandpassname": MaskedColumn([" D2 ", "D1", "D1", "", "D3"],
                                           mask=[False, False, False, False, True]),
    })
    result = metadata.build_metadata(table, 1, 2)
    assert result.target_name == "Orion"
    assert result.instrument == "SPHEREx"
    assert result.catalog_id == "spherex_dr1"
    assert result.available_dates == ["2025-05-01", "2025-05-03"]
    assert result.available_bands == ["D1", "D2"]
    assert result.frame_count == 5
    assert result.observation_window == "2025-05-01 \u2013 2025-05-03"


def test_empty_metadata_uses_defaults():
    result = metadata.build_metadata(Table(), 10, -20)
    assert result.target_name == "RA 10.0000\u00b0 Dec -20.0000\u00b0"
    assert result.instrument == "SPHEREx"
    assert result.available_dates == result.available_bands == []
    assert result.frame_count == 0
    assert result.observation_window == ""


def test_metadata_without_optional_columns_and_invalid_times():
    result = metadata.build_metadata(Table({"t_min": [np.nan, np.inf]}), 1, 2)
    assert result.available_dates == []
    assert result.available_bands == []
    assert result.frame_count == 2
    assert result.observation_window == ""


def test_metadata_service_passes_coordinates_to_archive(monkeypatch):
    search = Mock(return_value=Table())
    monkeypatch.setattr(metadata, "search_images", search)
    result = metadata.get_coordinate_metadata(133.795, -7.2455)
    search.assert_called_once_with(133.795, -7.2455)
    assert result.frame_count == 0
