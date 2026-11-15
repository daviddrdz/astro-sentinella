import { COORDINATE_LIMITS, PORTAL_PLACEHOLDERS } from "../config/app";
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
