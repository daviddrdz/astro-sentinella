import { describe, expect, it } from "vitest";
import {
  clamp01,
  containedBox,
  formatFlux,
  formatTick,
  niceStep,
} from "./spectrum";

describe("containedBox", () => {
  it("letterboxes a square image inside a wide container", () => {
    expect(
      containedBox({ width: 400, height: 200 }, { width: 29, height: 29 })
    ).toEqual({ left: 100, top: 0, width: 200, height: 200 });
  });

  it("pillarboxes a wide image inside a tall container", () => {
    expect(
      containedBox({ width: 100, height: 300 }, { width: 200, height: 100 })
    ).toEqual({ left: 0, top: 125, width: 100, height: 50 });
  });
});

describe("niceStep and formatting", () => {
  it("picks 1-2-5 steps", () => {
    expect(niceStep(10, 4)).toBe(2);
    expect(niceStep(0.9, 4)).toBeCloseTo(0.2);
    expect(niceStep(3, 4)).toBeCloseTo(1);
    expect(niceStep(2.4, 4)).toBeCloseTo(0.5);
  });

  it("formats fluxes compactly", () => {
    expect(formatFlux(1.23456)).toBe("1.23");
    expect(formatFlux(0.0012)).toBe("1.20e-3");
    expect(formatFlux(0)).toBe("0.00");
    expect(formatTick(-0.5, 0.5)).toBe("-0.5");
    expect(formatTick(2, 1)).toBe("2");
    expect(formatTick(0.04, 0.02)).toBe("0.04");
  });

  it("clamps click fractions", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.4)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});
