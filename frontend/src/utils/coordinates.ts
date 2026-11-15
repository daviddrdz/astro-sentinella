import type { CoordinateMetadata, QueryParams } from "../types/portal";

const RA_HMS_PATTERN =
  /^\s*(?:[01]?\d|2[0-3])\s*(?:h|:|\s)\s*[0-5]?\d\s*(?:m|:|\s)\s*[0-5]?\d(?:\.\d+)?\s*s?\s*$/i;
const DEC_DMS_PATTERN =
  /^\s*[+-]?\s*(?:[0-8]?\d|90)\s*(?:°|deg|d|:|\s)\s*[0-5]?\d\s*(?:'|m|:|\s)\s*[0-5]?\d(?:\.\d+)?\s*(?:"|s)?\s*$/i;
const DECIMAL_NUMBER_PATTERN = /^\s*[+-]?\d+(?:\.\d+)?\s*$/;

export type QueryFieldErrors = Partial<Record<keyof QueryParams, string>>;

interface SeedEntry {
  raKey: string;
  decKey: string;
  metadata: CoordinateMetadata;
}

function normalizeCoordinateKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[°'"hmsd:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const METADATA_CATALOG: SeedEntry[] = [
  {
    raKey: normalizeCoordinateKey("05h 35m 17s"),
    decKey: normalizeCoordinateKey("-05° 23' 28\""),
    metadata: {
      targetName: "Orion Nebula",
      catalogId: "M42",
      instrument: "NIRCam / HST Composite",
      availableBands: ["Ha", "OIII", "IR", "UV"],
      frameCount: 12,
      observationWindow: "2026-10-12 | 18:10Z to 20:00Z",
    },
  },
  {
    raKey: normalizeCoordinateKey("13h 29m 52s"),
    decKey: normalizeCoordinateKey("+47° 11' 43\""),
    metadata: {
      targetName: "Whirlpool Galaxy",
      catalogId: "M51",
      instrument: "JWST / MIRI",
      availableBands: ["IR", "BB", "Ha"],
      frameCount: 8,
      observationWindow: "2026-09-04 | 04:15Z to 05:30Z",
    },
  },
];

export function validateRa(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Enter Right Ascension (e.g. 05h 35m 17s).";
  }
  if (RA_HMS_PATTERN.test(trimmed)) {
    return undefined;
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (deg >= 0 && deg < 360) {
      return undefined;
    }
  }
  return "Use HMS format (05h 35m 17s) or degrees (0 to 360).";
}

export function validateDec(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Enter Declination (e.g. -05° 23' 28\").";
  }
  if (DEC_DMS_PATTERN.test(trimmed)) {
    return undefined;
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (deg >= -90 && deg <= 90) {
      return undefined;
    }
  }
  return "Use DMS format (-05° 23' 28\") or degrees (-90 to +90).";
}

export function validateFieldSize(value: string): string | undefined {
  const cleaned = value.trim().replace(/\s*deg\s*$/i, "");
  if (!cleaned) {
    return "Enter a field size in degrees (e.g. 0.5).";
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0 || num > 10) {
    return "Field size must be between 0.01 and 10 deg.";
  }
  return undefined;
}

export function validateObservationDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Select an observation date.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "Use YYYY-MM-DD format.";
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "Enter a valid calendar date.";
  }
  return undefined;
}

export function validateQueryParams(params: QueryParams): QueryFieldErrors {
  const errors: QueryFieldErrors = {};
  const raError = validateRa(params.ra);
  const decError = validateDec(params.dec);
  const fieldSizeError = validateFieldSize(params.fieldSizeDeg);
  const dateError = validateObservationDate(params.observationDate);

  if (raError) errors.ra = raError;
  if (decError) errors.dec = decError;
  if (fieldSizeError) errors.fieldSizeDeg = fieldSizeError;
  if (dateError) errors.observationDate = dateError;

  return errors;
}

export function lookupCoordinateMetadata(
  ra: string,
  dec: string
): CoordinateMetadata | null {
  if (validateRa(ra) || validateDec(dec)) {
    return null;
  }
  const raKey = normalizeCoordinateKey(ra);
  const decKey = normalizeCoordinateKey(dec);
  const match = METADATA_CATALOG.find(
    (entry) => entry.raKey === raKey && entry.decKey === decKey
  );
  return match ? match.metadata : null;
}

export function formatFieldSizeDisplay(value: string): string {
  const cleaned = value.trim().replace(/\s*deg\s*$/i, "");
  return `${cleaned} deg`;
}
