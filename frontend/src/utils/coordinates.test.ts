import { describe, expect, it } from "vitest";
import { PORTAL_PLACEHOLDERS } from "../config/app";
import {
  formatFieldSizeDisplay,
  hasValidCoordinates,
  validateDec,
  validateFieldSize,
  validateObservationDate,
  validateQueryParams,
  validateRa,
} from "./coordinates";

describe("coordinate validation", () => {
  it("validates RA in HMS and decimal degrees", () => {
    expect(validateRa(PORTAL_PLACEHOLDERS.ra)).toBeUndefined();
    expect(validateRa("05:35:17")).toBeUndefined();
    expect(validateRa("83.82")).toBeUndefined();
    expect(validateRa("")).toBeDefined();
    expect(validateRa("29h 10m 00s")).toBeDefined();
  });

  it("validates Dec in DMS and decimal degrees", () => {
    expect(validateDec(PORTAL_PLACEHOLDERS.dec)).toBeUndefined();
    expect(validateDec("+47 11 43")).toBeUndefined();
    expect(validateDec("-5.39")).toBeUndefined();
    expect(validateDec("")).toBeDefined();
    expect(validateDec("-95")).toBeDefined();
  });

  it("validates field size and observation date", () => {
    expect(validateFieldSize("0.5")).toBeUndefined();
    expect(validateFieldSize(PORTAL_PLACEHOLDERS.fieldSizeDeg)).toBeUndefined();
    expect(validateFieldSize("0")).toBeDefined();
    expect(validateFieldSize("15")).toBeDefined();

    expect(
      validateObservationDate(PORTAL_PLACEHOLDERS.observationDate)
    ).toBeUndefined();
    expect(validateObservationDate("")).toBeDefined();
    expect(validateObservationDate("12-10-2026")).toBeDefined();
  });

  it("checks coordinate pair validity", () => {
    expect(
      hasValidCoordinates(PORTAL_PLACEHOLDERS.ra, PORTAL_PLACEHOLDERS.dec)
    ).toBe(true);
    expect(hasValidCoordinates("invalid", PORTAL_PLACEHOLDERS.dec)).toBe(false);
    expect(hasValidCoordinates(PORTAL_PLACEHOLDERS.ra, "")).toBe(false);
  });

  it("validates complete query payloads and formats field size", () => {
    expect(
      validateQueryParams({
        ra: PORTAL_PLACEHOLDERS.ra,
        dec: PORTAL_PLACEHOLDERS.dec,
        fieldSizeDeg: PORTAL_PLACEHOLDERS.fieldSizeDeg,
        observationDate: PORTAL_PLACEHOLDERS.observationDate,
      })
    ).toEqual({});
    expect(formatFieldSizeDisplay("0.5")).toBe("0.5 deg");
    expect(formatFieldSizeDisplay("0.5 deg")).toBe("0.5 deg");
  });
});
