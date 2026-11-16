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
        band: "Ha",
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

describe("frame response validation", () => {
  const valid = {
    id: "frame-1",
    timestamp: "02:00Z",
    band: "IR",
    filtered: false,
    visible: true,
  };
  afterEach(() => vi.restoreAllMocks());

  it.each([429, 500, 502])("handles HTTP %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status })
    );
    expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);
  });

  it.each([null, {}, "frames", 42])(
    "rejects non-array response %j",
    async (payload) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload));
      expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);
    }
  );

  it.each([
    null,
    42,
    {},
    { ...valid, id: 42 },
    { ...valid, timestamp: null },
    { ...valid, band: "unknown" },
    { ...valid, filtered: "false" },
    { ...valid, visible: 1 },
  ])(
    "filters an invalid frame while keeping valid siblings: %j",
    async (invalid) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json([invalid, valid])
      );
      expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([valid]);
    }
  );

  it.each(["Ha", "OIII", "IR", "UV", "BB"])(
    "accepts supported band %s",
    async (band) => {
      const frame = { ...valid, band, imageUrl: "/api/frames/image" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([frame]));
      expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([frame]);
    }
  );

  it("encodes all trimmed query parameters and forwards cancellation", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json([]));
    const controller = new AbortController();
    await fetchExplorerFrames(
      {
        ...SAMPLE_QUERY,
        ra: " 05h 35m 17s ",
        dec: " +05d 23m 28s ",
        fieldSizeDeg: " 0.5 ",
        observationDate: " 2025-05-01 ",
      },
      controller.signal
    );
    const [input, options] = fetch.mock.calls[0];
    const url = new URL(String(input), "http://localhost");
    expect(url.pathname).toBe("/api/frames");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ra: "05h 35m 17s",
      dec: "+05d 23m 28s",
      fieldSizeDeg: "0.5",
      observationDate: "2025-05-01",
    });
    expect(options?.signal).toBe(controller.signal);
  });

  it("handles invalid JSON and cancelled requests", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("invalid JSON"));
    expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);
    fetch.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    expect(await fetchExplorerFrames(SAMPLE_QUERY)).toEqual([]);
  });
});
