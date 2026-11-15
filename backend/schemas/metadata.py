from dataclasses import dataclass


@dataclass(frozen=True)
class CoordinateMetadata:
    target_name: str
    catalog_id: str
    instrument: str
    available_bands: list[str]
    available_dates: list[str]
    frame_count: int
    observation_window: str

    def to_json(self) -> dict:
        # Field names match CoordinateMetadata in frontend/src/types/portal.ts.
        return {
            "targetName": self.target_name,
            "catalogId": self.catalog_id,
            "instrument": self.instrument,
            "availableBands": self.available_bands,
            "availableDates": self.available_dates,
            "frameCount": self.frame_count,
            "observationWindow": self.observation_window,
        }
