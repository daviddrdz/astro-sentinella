import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import {
  APP_CONFIG,
  PORTAL_FEATURED_SECTORS,
  PORTAL_PLACEHOLDERS,
} from "./config/app";

// The real debounce is covered with fake timers in QueryPortalCard.test.tsx.
// App integration tests should wait for the result, not race a 600ms timer.
vi.mock("./config/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config/app")>();
  return {
    ...actual,
    APP_CONFIG: { ...actual.APP_CONFIG, metadataDebounceMs: 0 },
  };
});

describe("Astro Sentinella Portal", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("renders navbar links and the four portal query inputs", () => {
    render(<App />);

    expect(screen.getByTestId("portal-space-backdrop")).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Observation Date")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
  });

  it("fetches metadata and populates Observation Date options from coordinates without clicking Query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        targetName: "Orion Nebula",
        catalogId: "M42",
        instrument: "NIRCam",
        availableBands: ["Ha", "OIII", "IR"],
        availableDates: [PORTAL_PLACEHOLDERS.observationDate, "2026-10-14"],
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

    const dateSelect = screen.getByLabelText("Observation Date");
    expect(dateSelect).toBeEnabled();
    expect(
      screen.getByRole("option", { name: PORTAL_PLACEHOLDERS.observationDate })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "2026-10-14" })
    ).toBeInTheDocument();
  });

  it("shows preview empty state with retry when no observation dates are found, and retries on click", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
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

    expect(
      await screen.findByText("No observation dates found in preview.")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Available coordinate metadata")
    ).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(screen.getByLabelText("Field Size (deg)"), {
      target: { value: "0.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));

    expect(
      screen.getByRole("heading", { name: "Compare" })
    ).toBeInTheDocument();
  });

  it("validates fields on submit and focuses the first invalid input", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Explore" }));

    const raInput = screen.getByLabelText("RA");
    expect(raInput).toHaveAttribute("aria-invalid", "true");
    expect(raInput).toHaveFocus();
  });

  it("transitions to Explorer on valid submission and allows returning to Portal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        targetName: "Orion Nebula",
        catalogId: "M42",
        instrument: "NIRCam",
        availableBands: ["Ha", "OIII"],
        availableDates: [PORTAL_PLACEHOLDERS.observationDate],
        frameCount: 12,
        observationWindow: "2026-10-12",
      }),
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

    const dateSelect = await screen.findByLabelText("Observation Date");
    await waitFor(() => {
      expect(dateSelect).toBeEnabled();
    });

    fireEvent.change(dateSelect, {
      target: { value: PORTAL_PLACEHOLDERS.observationDate },
    });

    fireEvent.click(screen.getByRole("button", { name: "Explore" }));

    expect(
      screen.getByRole("heading", { name: "Compare" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${PORTAL_PLACEHOLDERS.ra} | ${PORTAL_PLACEHOLDERS.dec} | 30 arcmin | ${PORTAL_PLACEHOLDERS.observationDate}`
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Portal" }));
    expect(screen.getByRole("button", { name: "Explore" })).toBeInTheDocument();
  });

  it("opens documentation dialog from navbar", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Docs" }));
    expect(
      screen.getByRole("heading", { name: "Documentation" })
    ).toBeInTheDocument();
  });

  it("saves submitted coordinates to browser history without rendering a bottom list, and caps autocomplete to 10 best matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    const entries = Array.from({ length: 12 }, (_, idx) => ({
      ra: `05h 35m ${String(10 + idx).padStart(2, "0")}s`,
      dec: PORTAL_PLACEHOLDERS.dec,
      fieldSizeDeg: "0.5",
      observationDate: PORTAL_PLACEHOLDERS.observationDate,
    }));
    window.localStorage.setItem(
      "astro-sentinella.portal-history.v1",
      JSON.stringify(entries)
    );

    render(<App />);

    expect(
      screen.queryByRole("region", { name: "Recent coordinate queries" })
    ).not.toBeInTheDocument();

    const raInput = screen.getByLabelText("RA");
    fireEvent.focus(raInput);
    fireEvent.change(raInput, { target: { value: "05h 35m" } });

    const listbox = screen.getByRole("listbox", {
      name: "RA autocomplete suggestions",
    });
    expect(within(listbox).getAllByRole("option")).toHaveLength(10);
  });

  it("ignores invalid entries in history and provides RA autocomplete suggestions", async () => {
    window.localStorage.setItem(
      "astro-sentinella.portal-history.v1",
      JSON.stringify([
        {
          ra: "invalid-ra",
          dec: "invalid-dec",
          fieldSizeDeg: "999",
          observationDate: "",
        },
        {
          ra: PORTAL_PLACEHOLDERS.ra,
          dec: PORTAL_PLACEHOLDERS.dec,
          fieldSizeDeg: "0.5",
          observationDate: PORTAL_PLACEHOLDERS.observationDate,
        },
      ])
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(<App />);

    const raInput = screen.getByLabelText("RA");
    fireEvent.focus(raInput);
    fireEvent.change(raInput, { target: { value: "05h" } });

    const listbox = screen.getByRole("listbox", {
      name: "RA autocomplete suggestions",
    });
    expect(listbox).toBeInTheDocument();
    expect(listbox).toHaveTextContent(PORTAL_PLACEHOLDERS.ra);
    expect(listbox).not.toHaveTextContent("invalid-ra");

    fireEvent.mouseDown(within(listbox).getByRole("button"));

    expect(raInput).toHaveValue(PORTAL_PLACEHOLDERS.ra);
    expect(screen.getByLabelText("Dec")).toHaveValue(PORTAL_PLACEHOLDERS.dec);
    expect(screen.getByLabelText("Field Size (deg)")).toHaveValue("0.5");
  });

  it("populates coordinates when selecting a SPHEREx target sector", () => {
    const targetSector = PORTAL_FEATURED_SECTORS[0];
    render(<App />);

    const sectorSection = screen.getByRole("region", {
      name: "SPHEREx target sectors",
    });
    const sectorButton = within(sectorSection).getByRole("button", {
      name: new RegExp(targetSector.name, "i"),
    });
    fireEvent.click(sectorButton);

    expect(screen.getByLabelText("RA")).toHaveValue(targetSector.ra);
    expect(screen.getByLabelText("Dec")).toHaveValue(targetSector.dec);
    expect(screen.getByLabelText("Field Size (deg)")).toHaveValue(
      targetSector.fieldSizeDeg
    );
  });

  it("initializes portal fields from URL query parameters (?ra, ?dec, ?fov)", () => {
    window.history.replaceState(null, "", "/?ra=335.23059&dec=-36.47150&fov=4");

    render(<App />);

    expect(screen.getByLabelText("RA")).toHaveValue("335.23059");
    expect(screen.getByLabelText("Dec")).toHaveValue("-36.47150");
    expect(screen.getByLabelText("Field Size (deg)")).toHaveValue("4");
  });
});
