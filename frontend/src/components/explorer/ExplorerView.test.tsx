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
    expect(
      screen.getByRole("heading", { name: "Compare" })
    ).toBeInTheDocument();
    expect(screen.getByText("Restas")).toBeInTheDocument();
    expect(screen.getByText("Band / Channel")).toBeInTheDocument();
    expect(screen.getByLabelText("Channel Tint")).toBeInTheDocument();
    expect(screen.getByLabelText("Opacity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Blend Mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Layers" })
    ).not.toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getByText("18:40Z | 1")).toBeInTheDocument();
  });

  it("selects two frames from timeline, requests comparison, and saves result in Restas", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/frames/compare")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                summary: "Sector diff computed",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            )
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      });

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const comparePanel = screen.getByRole("complementary", {
      name: "Compare inspector",
    });

    // Normal timeline has no compare selection buttons until Compare mode starts
    expect(
      screen.queryByRole("button", { name: "Select for compare 18:40Z" })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(comparePanel).getByRole("button", { name: "Compare 2 frames" })
    );

    const compareBtn = within(comparePanel).getByRole("button", {
      name: "Compare",
    });
    expect(compareBtn).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Select for compare 18:40Z" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select for compare 18:50Z" })
    );

    expect(within(comparePanel).getByText("18:40Z | 1")).toBeInTheDocument();
    expect(within(comparePanel).getByText("18:50Z | 1")).toBeInTheDocument();
    expect(compareBtn).toBeEnabled();

    fireEvent.click(compareBtn);
    expect(screen.getByTestId("compare-skeleton")).toBeInTheDocument();

    // Timeline returns to normal state after starting comparison
    expect(
      screen.queryByRole("button", { name: "Select for compare 18:40Z" })
    ).not.toBeInTheDocument();

    expect(
      await within(comparePanel).findByText("18:40Z - 18:50Z")
    ).toBeInTheDocument();
    expect(
      within(comparePanel).getByText("Sector diff computed")
    ).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        String(url).includes("/api/frames/compare")
      )
    ).toBe(true);

    // Exit subtraction view and re-visualize from Restas
    fireEvent.click(
      within(comparePanel).getByRole("button", { name: "Back to frame" })
    );
    expect(screen.queryByText("Sector diff computed")).toBeInTheDocument();

    fireEvent.click(
      within(comparePanel).getByRole("button", {
        name: /18:40Z - 18:50Z/i,
      })
    );
    expect(within(comparePanel).getByText("Viewing")).toBeInTheDocument();
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
    expect(
      screen.getByRole("heading", { name: "Comparar" })
    ).toBeInTheDocument();
    expect(screen.getByText("Línea de tiempo")).toBeInTheDocument();
  });

  it("toggles between 2D and 3D views and switches 3D space scales", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const btn3D = screen.getByRole("button", { name: "3D" });
    fireEvent.click(btn3D);

    expect(screen.getByTestId("explorer-3d-canvas")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sky View" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Neighborhood" }));
    expect(screen.getByRole("tab", { name: "Neighborhood" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Milky Way" }));
    expect(screen.getByRole("tab", { name: "Milky Way" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Solar System" }));
    expect(screen.getByRole("tab", { name: "Solar System" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "2D" }));
    expect(screen.queryByTestId("explorer-3d-canvas")).not.toBeInTheDocument();
  });

  it("toggles between 2D and 3D views and switches 3D space scales", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<ExplorerView query={SAMPLE_QUERY} onBackToPortal={vi.fn()} />);

    const btn3D = screen.getByRole("button", { name: "3D" });
    fireEvent.click(btn3D);

    expect(screen.getByTestId("explorer-3d-canvas")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sky View" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Neighborhood" }));
    expect(screen.getByRole("tab", { name: "Neighborhood" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Milky Way" }));
    expect(screen.getByRole("tab", { name: "Milky Way" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("tab", { name: "Solar System" }));
    expect(screen.getByRole("tab", { name: "Solar System" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "2D" }));
    expect(screen.queryByTestId("explorer-3d-canvas")).not.toBeInTheDocument();
  });
});
