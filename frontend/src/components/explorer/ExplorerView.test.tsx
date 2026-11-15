import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ExplorerView } from "./ExplorerView";
import type { QueryParams } from "../../types/portal";

const SAMPLE_QUERY: QueryParams = {
  ra: "05h 35m 17s",
  dec: "-05° 23' 28\"",
  fieldSizeDeg: "0.5",
  observationDate: "2026-10-12",
};

describe("ExplorerView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders navbar summary, tint controls, and timeline", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    expect(
      screen.getByText("05h 35m 17s | -05° 23' 28\" | 30 arcmin | 2026-10-12")
    ).toBeInTheDocument();
    expect(screen.queryByText("FRM-04 | Band 1")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Channel Tint")[0]).toHaveValue("magma");
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getByText("18:40Z | Band 4")).toBeInTheDocument();
  });

  it("changes the backend render tint from the toolbar", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const tintSelect = screen.getAllByLabelText("Channel Tint")[0];
    fireEvent.change(tintSelect, { target: { value: "inferno" } });
    expect(tintSelect).toHaveValue("inferno");
  });

  it("filters timeline frames by tab and band, and steps playback", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const timeline = screen.getByRole("region", { name: "Timeline" });

    fireEvent.click(within(timeline).getByRole("tab", { name: "Filtered" }));
    expect(within(timeline).getByText("18:50Z | Band 5")).toBeInTheDocument();
    expect(within(timeline).queryByText("18:10Z | Band 1")).not.toBeInTheDocument();

    fireEvent.click(within(timeline).getByRole("tab", { name: "All" }));
    fireEvent.change(within(timeline).getByLabelText("Detectors: All"), {
      target: { value: "Band 3" },
    });
    expect(within(timeline).getByText("18:30Z | Band 3")).toBeInTheDocument();
    expect(within(timeline).queryByText("18:40Z | Band 4")).not.toBeInTheDocument();

    fireEvent.change(within(timeline).getByLabelText("Detectors: All"), {
      target: { value: "all" },
    });
    fireEvent.click(
      within(timeline).getByRole("button", { name: "Next frame" })
    );
    expect(within(timeline).getByText("5 / 8")).toBeInTheDocument();
  });

  it("switches language between EN and ES", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle language" }));
    expect(screen.getByLabelText("Detectores: Todos")).toBeInTheDocument();
    expect(screen.getByText("Línea de tiempo")).toBeInTheDocument();
  });
});
