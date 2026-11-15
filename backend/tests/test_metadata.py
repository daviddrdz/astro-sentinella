import pytest
from astropy.table import MaskedColumn, Table
from astropy.time import Time

from app import app
from schemas.query import QueryValidationError, parse_coordinates
from services.irsa_archive import ArchiveUnavailableError
from services.metadata_service import build_metadata

VALID_ARGS = {"ra": "133.795", "dec": "-7.2455"}


@pytest.fixture
def client():
    return app.test_client()


def _mjd(iso: str) -> float:
    return Time(iso, scale="utc").mjd


def _archive_table() -> Table:
    return Table(
        {
            "t_min": MaskedColumn(
                [
                    _mjd("2025-11-03T05:00:00"),
                    _mjd("2025-05-05T01:00:00"),
                    _mjd("2025-05-05T23:00:00"),
                    0.0,
                ],
                mask=[False, False, False, True],
            ),
            "energy_bandpassname": ["D2", "D1", "D1", "D3"],
            "instrument_name": ["SPHEREx", "SPHEREx", "SPHEREx", "SPHEREx"],
            "access_url": ["a", "b", "c", "d"],
        }
    )


def test_parse_coordinates_accepts_portal_formats():
    coords = parse_coordinates({"ra": "05 35 17", "dec": "-05 23 28"})
    assert coords.ra_deg == pytest.approx(83.8208, abs=1e-3)
    assert coords.dec_deg == pytest.approx(-5.3911, abs=1e-3)


@pytest.mark.parametrize("overrides", [{"ra": ""}, {"dec": "-91"}, {"ra": "xyz"}])
def test_parse_coordinates_rejects_invalid_input(overrides):
    with pytest.raises(QueryValidationError):
        parse_coordinates({**VALID_ARGS, **overrides})


def test_build_metadata_summarizes_archive_results():
    meta = build_metadata(_archive_table(), 133.795, -7.2455)

    assert meta.available_dates == ["2025-05-05", "2025-11-03"]
    assert meta.available_bands == ["D1", "D2", "D3"]
    assert meta.instrument == "SPHEREx"
    assert meta.catalog_id == "spherex_dr1"
    assert meta.frame_count == 4
    assert meta.observation_window == "2025-05-05 – 2025-11-03"
    assert meta.target_name == "RA 133.7950° Dec -7.2455°"


def test_build_metadata_handles_empty_results():
    meta = build_metadata(Table({"t_min": [], "access_url": []}), 10.0, 20.0)

    assert meta.available_dates == []
    assert meta.available_bands == []
    assert meta.frame_count == 0
    assert meta.observation_window == ""


def test_metadata_route_returns_frontend_contract(client, monkeypatch):
    monkeypatch.setattr("services.metadata_service.search_images", lambda ra, dec: _archive_table())
    resp = client.get("/api/metadata", query_string=VALID_ARGS)

    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body) == {
        "targetName",
        "catalogId",
        "instrument",
        "availableBands",
        "availableDates",
        "frameCount",
        "observationWindow",
    }
    assert body["availableDates"] == ["2025-05-05", "2025-11-03"]


def test_metadata_route_rejects_invalid_coordinates(client):
    resp = client.get("/api/metadata", query_string={"ra": "1", "dec": "95"})
    assert resp.status_code == 400
    assert resp.get_json()["error"]["code"] == "invalid_request"


def test_metadata_route_hides_upstream_errors(client, monkeypatch):
    def fail(ra, dec):
        raise ArchiveUnavailableError("secret upstream detail")

    monkeypatch.setattr("services.metadata_service.search_images", fail)
    resp = client.get("/api/metadata", query_string=VALID_ARGS)

    assert resp.status_code == 502
    assert "secret" not in resp.get_data(as_text=True)
