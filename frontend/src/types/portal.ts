export interface QueryParams {
  ra: string;
  dec: string;
  fieldSizeDeg: string;
  observationDate: string;
}

export interface CoordinateMetadata {
  targetName: string;
  catalogId: string;
  instrument: string;
  availableBands: string[];
  frameCount: number;
  observationWindow: string;
}
