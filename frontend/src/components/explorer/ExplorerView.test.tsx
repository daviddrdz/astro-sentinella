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

  it("renders navbar summary, tools, layers inspector, and timeline", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    expect(
      screen.getByText("05h 35m 17s | -05° 23' 28\" | 30 arcmin | 2026-10-12")
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
    expect(screen.getByText("FRM-02 | 2")).toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getByText("18:40Z | 1")).toBeInTheDocument();
  });

  it("supports layer visibility toggle, undo/redo, and adding a layer", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const [undoBtn] = screen.getAllByRole("button", { name: "Undo" });
    const [redoBtn] = screen.getAllByRole("button", { name: "Redo" });
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();

    const toggleBtn = screen.getByRole("button", {
      name: "Toggle layer visibility FRM-02",
    });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    expect(undoBtn).toBeEnabled();

    fireEvent.click(undoBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
    expect(redoBtn).toBeEnabled();

    fireEvent.click(redoBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("FRM-03 | 1")).toBeInTheDocument();
  });

  it("filters timeline frames by tab and band, and steps playback", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const timeline = screen.getByRole("region", { name: "Timeline" });

    fireEvent.click(within(timeline).getByRole("tab", { name: "Filtered" }));
    expect(within(timeline).getByText("18:50Z | 1")).toBeInTheDocument();
    expect(within(timeline).queryByText("18:10Z | 1")).not.toBeInTheDocument();

    fireEvent.click(within(timeline).getByRole("tab", { name: "All" }));
    fireEvent.change(within(timeline).getByLabelText("Band: All"), {
      target: { value: "3" },
    });
    expect(within(timeline).getByText("18:30Z | 3")).toBeInTheDocument();
    expect(within(timeline).queryByText("18:40Z | 1")).not.toBeInTheDocument();

    fireEvent.change(within(timeline).getByLabelText("Band: All"), {
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
    expect(screen.getByRole("heading", { name: "Capas" })).toBeInTheDocument();
    expect(screen.getByText("Línea de tiempo")).toBeInTheDocument();
  });
});
