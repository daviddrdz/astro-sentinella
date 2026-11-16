import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExplorerView } from "./ExplorerView";
import type { QueryParams } from "../../types/portal";

const QUERY: QueryParams = {
  ra: "83.82",
  dec: "-5.39",
  fieldSizeDeg: "0.05",
  observationDate: "2025-05-01",
};

const SPECTRUM = {
  chunk: {
    row: 0,
    col: 3,
    rows: 7,
    cols: 7,
    sizeArcsec: 25.5,
    bounds: { left: 3 / 7, top: 0, width: 1 / 7, height: 1 / 7 },
  },
  center: { ra: 83.8201, dec: -5.3812 },
  pixelCount: 4,
  unit: "MJy/sr",
  source: "SPHEREx DR1 HiPS cube",
  points: [
    { wavelengthUm: 0.75, bandwidthUm: 0.02, flux: 1.2 },
    { wavelengthUm: 3.3, bandwidthUm: 0.04, flux: 4.8 },
    { wavelengthUm: 4.9, bandwidthUm: 0.05, flux: 2.1 },
  ],
};

function mockBackend(spectrumResponse: () => Response) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/metadata")) {
        return new Response(
          JSON.stringify({
            targetName: "Test",
            catalogId: "T-1",
            availableBands: [1, 2],
            availableDates: ["2025-05-01"],
          }),
          { status: 200 }
        );
      }
      if (url.startsWith("/api/frames/spectrum")) {
        return spectrumResponse();
      }
      return new Response("[]", { status: 200 });
    });
}

async function openSpectrumAndLoadFrame() {
  render(<ExplorerView query={QUERY} onBackToPortal={vi.fn()} />);
  const [spectrumTool] = screen.getAllByRole("button", { name: "Spectrum" });
  fireEvent.click(spectrumTool!);

  const img = await screen.findByAltText("FRM-02 astronomical cutout");
  await waitFor(() =>
    expect(img.getAttribute("src")).toContain("observationDate=2025-05-01")
  );
  Object.defineProperty(img, "naturalWidth", { value: 290 });
  Object.defineProperty(img, "naturalHeight", { value: 290 });
  fireEvent.load(img);

  const overlay = await screen.findByTestId("chunk-overlay");
  overlay.getBoundingClientRect = () =>
    ({ left: 100, top: 0, width: 400, height: 400 }) as DOMRect;
  return overlay;
}

describe("ExplorerView spectrum tool", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a click to image fractions and shows the chunk spectrum", async () => {
    const fetchMock = mockBackend(
      () => new Response(JSON.stringify(SPECTRUM), { status: 200 })
    );
    const overlay = await openSpectrumAndLoadFrame();

    expect(screen.getByText(/Click anywhere on the frame/)).toBeInTheDocument();
    // object-contain: a square image in a 600x400 box sits at left=100, 400 wide
    expect(overlay.style.left).toBe("100px");
    expect(overlay.style.width).toBe("400px");

    fireEvent.click(overlay, { clientX: 300, clientY: 40 });

    await screen.findByTestId("spectrum-line");
    const spectrumCall = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.startsWith("/api/frames/spectrum"));
    const params = new URL(spectrumCall!, "http://x").searchParams;
    expect(params.get("x")).toBe("0.5000");
    expect(params.get("y")).toBe("0.1000");
    expect(params.get("observationDate")).toBe("2025-05-01");

    expect(screen.getByTestId("selected-chunk").style.left).toMatch(/^42\.85/);
    expect(screen.getByText("1,4 / 7×7 · 26″")).toBeInTheDocument();
  });

  it("explains when the mosaic has no coverage", async () => {
    mockBackend(
      () =>
        new Response(
          JSON.stringify({
            error: { code: "spectrum_unavailable", message: "none" },
          }),
          { status: 404 }
        )
    );
    const overlay = await openSpectrumAndLoadFrame();
    fireEvent.click(overlay, { clientX: 300, clientY: 40 });

    expect(
      await screen.findByText("No SPHEREx mosaic coverage for this area.")
    ).toBeInTheDocument();
  });

  it("closing the panel returns to the pan tool", async () => {
    mockBackend(() => new Response(JSON.stringify(SPECTRUM), { status: 200 }));
    await openSpectrumAndLoadFrame();
    fireEvent.click(screen.getByRole("button", { name: "Close spectrum" }));
    expect(screen.queryByTestId("chunk-overlay")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Chunk spectrum" })
    ).not.toBeInTheDocument();
  });
});
