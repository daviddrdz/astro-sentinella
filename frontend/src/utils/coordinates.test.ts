import { describe, expect, it } from "vitest";
import {
  formatFieldSizeDisplay,
  lookupCoordinateMetadata,
  validateDec,
  validateFieldSize,
  validateObservationDate,
  validateQueryParams,
  validateRa,
} from "./coordinates";

describe("coordinate validation and metadata lookup", () => {
  it("validates RA in HMS and decimal degrees", () => {
    expect(validateRa("05h 35m 17s")).toBeUndefined();
    expect(validateRa("05:35:17")).toBeUndefined();
    expect(validateRa("83.82")).toBeUndefined();
    expect(validateRa("")).toBeDefined();
    expect(validateRa("29h 10m 00s")).toBeDefined();
  });

  it("validates Dec in DMS and decimal degrees", () => {
    expect(validateDec("-05° 23' 28\"")).toBeUndefined();
    expect(validateDec("+47 11 43")).toBeUndefined();
    expect(validateDec("-5.39")).toBeUndefined();
    expect(validateDec("")).toBeDefined();
    expect(validateDec("-95")).toBeDefined();
  });

  it("validates field size and observation date", () => {
    expect(validateFieldSize("0.5")).toBeUndefined();
    expect(validateFieldSize("0.5 deg")).toBeUndefined();
    expect(validateFieldSize("0")).toBeDefined();
    expect(validateFieldSize("15")).toBeDefined();

    expect(validateObservationDate("2026-10-12")).toBeUndefined();
    expect(validateObservationDate("")).toBeDefined();
    expect(validateObservationDate("12-10-2026")).toBeDefined();
  });

  it("returns metadata immediately when valid coordinates match catalog", () => {
    const metadata = lookupCoordinateMetadata("05h 35m 17s", "-05° 23' 28\"");
    expect(metadata).not.toBeNull();
    expect(metadata?.catalogId).toBe("M42");
    expect(metadata?.availableBands).toEqual(["Ha", "OIII", "IR", "UV"]);

    const formattedMatch = lookupCoordinateMetadata("05:35:17", "-05 23 28");
    expect(formattedMatch?.catalogId).toBe("M42");

    expect(lookupCoordinateMetadata("10h 00m 00s", "+10° 00' 00\"")).toBeNull();
    expect(lookupCoordinateMetadata("invalid", "-05 23 28")).toBeNull();
  });

  it("validates complete query payloads and formats field size", () => {
    expect(
      validateQueryParams({
        ra: "05h 35m 17s",
        dec: "-05° 23' 28\"",
        fieldSizeDeg: "0.5",
        observationDate: "2026-10-12",
      })
    ).toEqual({});
    expect(formatFieldSizeDisplay("0.5")).toBe("0.5 deg");
    expect(formatFieldSizeDisplay("0.5 deg")).toBe("0.5 deg");
  });
});
