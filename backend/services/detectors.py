from datetime import date

from astropy.table import Table

from services.frames_service import available_detectors_for_date


def detector_catalog_for_date(table: Table, observation_date: date) -> dict:
    return {
        "observationDate": observation_date.isoformat(),
        "detectors": available_detectors_for_date(table, observation_date),
    }
