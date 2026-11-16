import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpectrumUrl,
  fetchChunkSpectrum,
  SpectrumRequestError,
} from "./spectrumService";

const FRAME_URL =
  "/api/frames/image?ra=83.82&dec=-5.39&fieldSizeDeg=0.05&observationDate=2025-05-01&color=magma&bands=2";

const SAMPLE_SPECTRUM = {
  chunk: {
    row: 1,
    col: 2,
    rows: 7,
    cols: 7,
    sizeArcsec: 25.5,
    bounds: { left: 2 / 7, top: 1 / 7, width: 1 / 7, height: 1 / 7 },
  },
  center: { ra: 83.82, dec: -5.39 },
  pixelCount: 4,
  unit: "MJy/sr",
  source: "SPHEREx DR1 HiPS cube",
  points: [
    { wavelengthUm: 0.75, bandwidthUm: 0.02, flux: 1.2 },
    { wavelengthUm: 1.5, bandwidthUm: 0.03, flux: null },
    { wavelengthUm: 3.3, bandwidthUm: 0.04, flux: 4.8 },
  ],
};

describe("spectrumService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the request from the frame URL, dropping render-only params", () => {
    const url = new URL(buildSpectrumUrl(FRAME_URL, 0.25, 0.5), "http://x");
    expect(url.pathname).toBe("/api/frames/spectrum");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ra: "83.82",
      dec: "-5.39",
      fieldSizeDeg: "0.05",
      observationDate: "2025-05-01",
      x: "0.2500",
      y: "0.5000",
    });
  });

  it("returns a validated spectrum", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_SPECTRUM), { status: 200 })
    );
    const result = await fetchChunkSpectrum(FRAME_URL, 0.3, 0.2);
    expect(result.points).toHaveLength(3);
    expect(result.chunk.rows).toBe(7);
  });

  it("surfaces the backend error code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "spectrum_unavailable", message: "No coverage." },
        }),
        { status: 404 }
      )
    );
    await expect(fetchChunkSpectrum(FRAME_URL, 0.3, 0.2)).rejects.toMatchObject(
      { code: "spectrum_unavailable" }
    );
  });

  it("rejects malformed payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ points: "nope" }), { status: 200 })
    );
    await expect(
      fetchChunkSpectrum(FRAME_URL, 0.3, 0.2)
    ).rejects.toBeInstanceOf(SpectrumRequestError);
  });
});
