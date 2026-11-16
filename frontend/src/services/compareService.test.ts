import { afterEach, describe, expect, it, vi } from "vitest";
import { requestFrameComparison } from "./compareService";
import type { ExplorerFrame } from "../types/explorer";
import type { QueryParams } from "../types/portal";

const SAMPLE_QUERY: QueryParams = {
  ra: " 83.82 ",
  dec: "-5.39",
  fieldSizeDeg: "0.05",
  observationDate: "2025-05-01",
};

const frame = (date: string): ExplorerFrame => ({
  id: `date-${date}`,
  timestamp: date,
  band: 2,
  filtered: false,
  visible: true,
});

describe("requestFrameComparison", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts both observation dates and the detector to /api/subtract", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          imageDataUrl: "data:image/png;base64,AAAA",
          summary: {
            meta: { days_between: 182 },
            difference_image: { flux_scale_k: 0.98765 },
            change_detection: null,
            change_detection_error:
              "Too few stars detected to compare the epochs",
            candidates: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await requestFrameComparison(
      SAMPLE_QUERY,
      frame("2025-05-01"),
      frame("2025-10-30"),
      3
    );

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/subtract");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      ra: "83.82",
      dec: "-5.39",
      observationDateA: "2025-05-01",
      observationDateB: "2025-10-30",
      detector: 3,
      size: 512,
    });
    expect(result).toEqual({
      ok: true,
      imageUrl: "data:image/png;base64,AAAA",
      summary: "D3 · Δt 182 d · k=0.988 · 0 candidates",
    });
  });

  it("surfaces the API error message on non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "image_not_found",
            message: "No detector D2 image found on 2025-10-30.",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await requestFrameComparison(
      SAMPLE_QUERY,
      frame("2025-05-01"),
      frame("2025-10-30"),
      2
    );
    expect(result).toEqual({
      ok: false,
      errorMessage: "No detector D2 image found on 2025-10-30.",
    });
  });

  it("falls back to the HTTP status when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gateway timeout", { status: 504 })
    );

    const result = await requestFrameComparison(
      SAMPLE_QUERY,
      frame("2025-05-01"),
      frame("2025-10-30"),
      2
    );
    expect(result).toEqual({ ok: false, errorMessage: "HTTP 504" });
  });
});
