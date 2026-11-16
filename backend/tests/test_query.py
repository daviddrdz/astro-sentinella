from datetime import date

import pytest

from schemas.query import (
    QueryValidationError, parse_coordinates, parse_field_size_deg, parse_sky_image_query,
)


@pytest.mark.parametrize("ra,dec", [(0, -90), (0, 90), (359.99999, 0)])
def test_coordinate_boundaries(ra, dec):
    result = parse_coordinates({"ra": str(ra), "dec": str(dec)})
    assert (result.ra_deg, result.dec_deg) == (ra, dec)


@pytest.mark.parametrize("ra,dec", [
    ("05 35 17", "-05 23 28"), ("05h35m17s", "-05d23m28s"),
])
def test_sexagesimal_coordinates(ra, dec):
    result = parse_coordinates({"ra": ra, "dec": dec})
    assert result.ra_deg == pytest.approx(83.82083333)
    assert result.dec_deg == pytest.approx(-5.39111111)


@pytest.mark.parametrize("value,expected", [
    ("0.01", 0.01), ("10", 10), (" 2 deg ", 2), ("", 0.05), (" ", 0.05),
])
def test_field_size_boundaries_units_and_empty_default(value, expected):
    assert parse_field_size_deg({"fieldSizeDeg": value}) == expected


@pytest.mark.parametrize("value", ["bad", "nan", "inf", "-inf", "0", "-1", "10.01"])
def test_invalid_field_size(value):
    with pytest.raises(QueryValidationError, match="fieldSizeDeg"):
        parse_field_size_deg({"fieldSizeDeg": value})


def test_default_field_size_and_leap_day():
    query = parse_sky_image_query({"ra": " 1 ", "dec": " 2 ", "observationDate": "2024-02-29"})
    assert (query.ra_deg, query.dec_deg) == (1.0, 2.0)
    assert query.observation_date == date(2024, 2, 29)
    assert query.field_size_deg == 0.05
    assert parse_field_size_deg({}, default=1.5) == 1.5
