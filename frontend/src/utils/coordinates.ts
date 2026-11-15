import {
  COORDINATE_LIMITS,
  PORTAL_HISTORY_CONFIG,
  PORTAL_PLACEHOLDERS,
  URL_QUERY_CONFIG,
} from "../config/app";
import type { QueryParams } from "../types/portal";

const RA_HMS_PATTERN =
  /^\s*(?:[01]?\d|2[0-3])\s*(?:h|:|\s)\s*[0-5]?\d\s*(?:m|:|\s)\s*[0-5]?\d(?:\.\d+)?\s*s?\s*$/i;
const DEC_DMS_PATTERN =
  /^\s*[+-]?\s*(?:[0-8]?\d|90)\s*(?:°|deg|d|:|\s)\s*[0-5]?\d\s*(?:'|m|:|\s)\s*[0-5]?\d(?:\.\d+)?\s*(?:"|s)?\s*$/i;
const DECIMAL_NUMBER_PATTERN = /^\s*[+-]?\d+(?:\.\d+)?\s*$/;

export type QueryFieldErrors = Partial<Record<keyof QueryParams, string>>;

export function validateRa(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return `Enter Right Ascension (e.g. ${PORTAL_PLACEHOLDERS.ra}).`;
  }
  if (RA_HMS_PATTERN.test(trimmed)) {
    return undefined;
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (deg >= COORDINATE_LIMITS.raMinDeg && deg < COORDINATE_LIMITS.raMaxDeg) {
      return undefined;
    }
  }
  return `Use HMS format (${PORTAL_PLACEHOLDERS.ra}) or degrees (${COORDINATE_LIMITS.raMinDeg} to ${COORDINATE_LIMITS.raMaxDeg}).`;
}

export function validateDec(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return `Enter Declination (e.g. ${PORTAL_PLACEHOLDERS.dec}).`;
  }
  if (DEC_DMS_PATTERN.test(trimmed)) {
    return undefined;
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (
      deg >= COORDINATE_LIMITS.decMinDeg &&
      deg <= COORDINATE_LIMITS.decMaxDeg
    ) {
      return undefined;
    }
  }
  return `Use DMS format (${PORTAL_PLACEHOLDERS.dec}) or degrees (${COORDINATE_LIMITS.decMinDeg} to +${COORDINATE_LIMITS.decMaxDeg}).`;
}

export function validateFieldSize(value: string): string | undefined {
  const cleaned = value.trim().replace(/\s*deg\s*$/i, "");
  if (!cleaned) {
    return `Enter a field size in degrees (e.g. ${PORTAL_PLACEHOLDERS.fieldSizeDeg}).`;
  }
  const num = Number(cleaned);
  if (
    !Number.isFinite(num) ||
    num < COORDINATE_LIMITS.fieldSizeMinDeg ||
    num > COORDINATE_LIMITS.fieldSizeMaxDeg
  ) {
    return `Field size must be between ${COORDINATE_LIMITS.fieldSizeMinDeg} and ${COORDINATE_LIMITS.fieldSizeMaxDeg} deg.`;
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

export function hasValidCoordinates(ra: string, dec: string): boolean {
  return !validateRa(ra) && !validateDec(dec);
}

export function formatFieldSizeDisplay(value: string): string {
  const cleaned = value.trim().replace(/\s*deg\s*$/i, "");
  return `${cleaned} deg`;
}

const RA_PARTS_PATTERN =
  /^\s*(\d{1,2})\s*(?:h|:|\s)\s*(\d{1,2})\s*(?:m|:|\s)\s*(\d{1,2}(?:\.\d+)?)\s*s?\s*$/i;
const DEC_PARTS_PATTERN =
  /^\s*([+-]?)\s*(\d{1,2})\s*(?:°|deg|d|:|\s)\s*(\d{1,2})\s*(?:'|m|:|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|s)?\s*$/i;

const HOURS_TO_DEG = 15;
const MINUTES_PER_UNIT = 60;
const SECONDS_PER_UNIT = 3600;
const SIGN_NEGATIVE = -1;
const SIGN_POSITIVE = 1;
const GROUP_ONE = 1;
const GROUP_TWO = 2;
const GROUP_THREE = 3;
const GROUP_FOUR = 4;

export function parseRaToDegrees(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hmsMatch = RA_PARTS_PATTERN.exec(trimmed);
  if (hmsMatch) {
    const hours = Number(hmsMatch[GROUP_ONE]);
    const minutes = Number(hmsMatch[GROUP_TWO]);
    const seconds = Number(hmsMatch[GROUP_THREE]);
    return (
      (hours + minutes / MINUTES_PER_UNIT + seconds / SECONDS_PER_UNIT) *
      HOURS_TO_DEG
    );
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (deg >= COORDINATE_LIMITS.raMinDeg && deg < COORDINATE_LIMITS.raMaxDeg) {
      return deg;
    }
  }
  return null;
}

export function parseDecToDegrees(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const dmsMatch = DEC_PARTS_PATTERN.exec(trimmed);
  if (dmsMatch) {
    const sign = dmsMatch[GROUP_ONE] === "-" ? SIGN_NEGATIVE : SIGN_POSITIVE;
    const degrees = Number(dmsMatch[GROUP_TWO]);
    const arcmin = Number(dmsMatch[GROUP_THREE]);
    const arcsec = Number(dmsMatch[GROUP_FOUR]);
    return (
      sign * (degrees + arcmin / MINUTES_PER_UNIT + arcsec / SECONDS_PER_UNIT)
    );
  }
  if (DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    const deg = Number(trimmed);
    if (
      deg >= COORDINATE_LIMITS.decMinDeg &&
      deg <= COORDINATE_LIMITS.decMaxDeg
    ) {
      return deg;
    }
  }
  return null;
}

export function parseUrlQueryParams(search: string): {
  initialValues: QueryParams;
  autoExplore: boolean;
} {
  const params = new URLSearchParams(search);
  const ra = (params.get(URL_QUERY_CONFIG.raKey) ?? "").trim();
  const dec = (params.get(URL_QUERY_CONFIG.decKey) ?? "").trim();
  const rawFov = (
    params.get(URL_QUERY_CONFIG.fovKey) ??
    params.get(URL_QUERY_CONFIG.fieldSizeKey) ??
    ""
  ).trim();
  const observationDate = (
    params.get(URL_QUERY_CONFIG.dateKey) ??
    params.get(URL_QUERY_CONFIG.observationDateKey) ??
    ""
  ).trim();

  const hasCoords = Boolean(ra || dec);
  const fieldSizeDeg =
    rawFov || (hasCoords ? URL_QUERY_CONFIG.defaultFieldSizeDeg : "");

  const initialValues: QueryParams = {
    ra,
    dec,
    fieldSizeDeg,
    observationDate,
  };

  const autoExplore =
    Boolean(ra && dec && fieldSizeDeg && observationDate) &&
    Object.keys(validateQueryParams(initialValues)).length ===
      PORTAL_HISTORY_CONFIG.emptyLength;

  return { initialValues, autoExplore };
}

export function buildUrlSearchString(params: Partial<QueryParams>): string {
  const urlParams = new URLSearchParams();
  if (params.ra?.trim()) {
    urlParams.set(URL_QUERY_CONFIG.raKey, params.ra.trim());
  }
  if (params.dec?.trim()) {
    urlParams.set(URL_QUERY_CONFIG.decKey, params.dec.trim());
  }
  if (params.fieldSizeDeg?.trim()) {
    urlParams.set(
      URL_QUERY_CONFIG.fovKey,
      params.fieldSizeDeg.trim().replace(/\s*deg\s*$/i, "")
    );
  }
  if (params.observationDate?.trim()) {
    urlParams.set(URL_QUERY_CONFIG.dateKey, params.observationDate.trim());
  }
  const str = urlParams.toString();
  return str ? `?${str}` : "";
}
