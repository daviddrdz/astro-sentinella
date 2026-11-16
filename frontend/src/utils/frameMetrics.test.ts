import { describe, expect, it } from "vitest";
import { angularSeparationDeg, formatAngularSeparation } from "./frameMetrics";

describe("frameMetrics", () => {
  it("computes spherical angular separation between two J2000 coordinates", () => {
    expect(angularSeparationDeg(10, 0, 10, 0)).toBeCloseTo(0, 6);
    expect(angularSeparationDeg(0, 0, 90, 0)).toBeCloseTo(90, 6);
    expect(angularSeparationDeg(0, 90, 0, -90)).toBeCloseTo(180, 6);
  });

  it("formats angular separation in degrees, arcminutes, or arcseconds", () => {
    expect(formatAngularSeparation(12.345)).toBe("12.35°");
    expect(formatAngularSeparation(0.5)).toBe("30.0'");
    expect(formatAngularSeparation(0.005)).toBe('18.0"');
  });
});
