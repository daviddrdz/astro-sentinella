import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCoordinateMetadata } from "./metadataService";

const METADATA = {
  targetName: "Orion",
  catalogId: "M42",
  instrument: "SPHEREx",
  availableBands: ["IR"],
  availableDates: ["2025-05-01"],
  frameCount: 2,
  observationWindow: "2025-05-01",
};

afterEach(() => vi.restoreAllMocks());

describe("metadata API", () => {
  it("preserves the response contract and encodes trimmed coordinates and signal", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(METADATA));
    const controller = new AbortController();
    expect(
      await fetchCoordinateMetadata(
        " 05h 35m 17s ",
        " +05d 23m 28s ",
        controller.signal
      )
    ).toEqual(METADATA);
    const [input, options] = fetch.mock.calls[0];
    const url = new URL(String(input), "http://localhost");
    expect(url.pathname).toBe("/api/metadata");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ra: "05h 35m 17s",
      dec: "+05d 23m 28s",
    });
    expect(options?.signal).toBe(controller.signal);
  });

  it.each([400, 404, 429, 500, 502])(
    "returns null for HTTP %i without parsing its body",
    async (status) => {
      const response = new Response("not JSON", { status });
      const json = vi.spyOn(response, "json");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      expect(await fetchCoordinateMetadata("1", "2")).toBeNull();
      expect(json).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    [],
    {},
    { ...METADATA, targetName: 42 },
    { ...METADATA, catalogId: null },
    { ...METADATA, availableBands: "IR" },
  ])("rejects malformed metadata: %j", async (payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload));
    expect(await fetchCoordinateMetadata("1", "2")).toBeNull();
  });

  it("defaults missing optional fields and filters invalid dates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        targetName: "Orion",
        catalogId: "M42",
        availableBands: [],
        availableDates: ["2025-05-01", null, 42, ""],
      })
    );
    expect(await fetchCoordinateMetadata("1", "2")).toEqual({
      targetName: "Orion",
      catalogId: "M42",
      availableBands: [],
      availableDates: ["2025-05-01"],
      instrument: "",
      frameCount: 0,
      observationWindow: "",
    });
  });

  it.each([
    new TypeError("Network down"),
    new DOMException("Cancelled", "AbortError"),
  ])("handles fetch rejection: %s", async (error) => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    expect(await fetchCoordinateMetadata("1", "2")).toBeNull();
  });

  it("handles an invalid JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("broken JSON")
    );
    expect(await fetchCoordinateMetadata("1", "2")).toBeNull();
  });
});
