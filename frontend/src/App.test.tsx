import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { APP_CONFIG, PORTAL_PLACEHOLDERS } from "./config/app";

describe("Astro Earth Portal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders navbar links and the four portal query inputs", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: APP_CONFIG.name })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      APP_CONFIG.githubUrl
    );

    expect(screen.getByLabelText("RA")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByLabelText("Dec")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByLabelText("Field Size (deg)")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByLabelText("Observation Date")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(screen.getByRole("button", { name: "Query" })).toBeInTheDocument();
  });

  it("fetches and displays available metadata from coordinates without clicking Query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        targetName: "Orion Nebula",
        catalogId: "M42",
        instrument: "NIRCam",
        availableBands: ["Ha", "OIII", "IR"],
        frameCount: 12,
        observationWindow: "2026-10-12",
      }),
    } as Response);

    render(<App />);

    expect(
      screen.queryByLabelText("Available coordinate metadata")
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: PORTAL_PLACEHOLDERS.ra },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: PORTAL_PLACEHOLDERS.dec },
    });

    const metadataPanel = await screen.findByLabelText(
      "Available coordinate metadata"
    );
    expect(metadataPanel).toHaveTextContent("M42 | Orion Nebula");
    expect(metadataPanel).toHaveTextContent("Ha | OIII | IR");
    expect(metadataPanel).toHaveTextContent("12 frames");
  });

  it("hides metadata panel when no metadata is available for coordinates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);

    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: PORTAL_PLACEHOLDERS.ra },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: PORTAL_PLACEHOLDERS.dec },
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(
      screen.queryByLabelText("Available coordinate metadata")
    ).not.toBeInTheDocument();
  });

  it("validates fields on submit and focuses the first invalid input", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    const raInput = screen.getByLabelText("RA");
    expect(raInput).toHaveAttribute("aria-invalid", "true");
    expect(raInput).toHaveFocus();
  });

  it("transitions to Explorer on valid submission and allows returning to Portal", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    render(<App />);

    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: PORTAL_PLACEHOLDERS.ra },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: PORTAL_PLACEHOLDERS.dec },
    });
    fireEvent.change(screen.getByLabelText("Field Size (deg)"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Observation Date"), {
      target: { value: PORTAL_PLACEHOLDERS.observationDate },
    });

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    expect(
      screen.getByRole("heading", { name: "Explorer" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        `${PORTAL_PLACEHOLDERS.ra} | ${PORTAL_PLACEHOLDERS.dec} | 0.5 deg | ${PORTAL_PLACEHOLDERS.observationDate}`
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Query" })).toBeInTheDocument();
  });

  it("opens documentation dialog from navbar", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    expect(
      screen.getByRole("heading", { name: "Documentation" })
    ).toBeInTheDocument();
  });
});
