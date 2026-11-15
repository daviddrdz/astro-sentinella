import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchExplorerFrames } from "./framesService";
import type { QueryParams } from "../types/portal";

const SAMPLE_QUERY: QueryParams = {
  ra: "05h 35m 17s",
  dec: "-05° 23' 28\"",
  fieldSizeDeg: "0.5",
  observationDate: "2026-10-12",
};

describe("fetchExplorerFrames", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns validated frames when the backend responds with valid JSON", async () => {
    const payload = [
      {
        id: "f-1",
        timestamp: "18:40Z",
        band: 1,
        filtered: false,
        visible: true,
      },
      { invalid: true },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );

    const result = await fetchExplorerFrames(SAMPLE_QUERY);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("f-1");
  });

  it("returns empty array when the backend returns non-OK or network error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );
    expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));
    expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);
  });
});
