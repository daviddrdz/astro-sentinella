import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_CONFIG } from "../config/app";
import { fetchCoordinateMetadata } from "../services/metadataService";
import type { CoordinateMetadata } from "../types/portal";
import { QueryPortalCard } from "./QueryPortalCard";

vi.mock("../services/metadataService", () => ({
  fetchCoordinateMetadata: vi.fn(),
}));

const INITIAL = {
  ra: "83.82",
  dec: "-5.39",
  fieldSizeDeg: "0.5",
  observationDate: "2025-05-01",
};
const METADATA: CoordinateMetadata = {
  targetName: "Orion",
  catalogId: "M42",
  instrument: "SPHEREx",
  availableBands: ["IR"],
  availableDates: ["2025-05-01"],
  frameCount: 2,
  observationWindow: "2025-05-01",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchCoordinateMetadata).mockReset();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(APP_CONFIG.metadataDebounceMs);
  });
}

describe("metadata request lifecycle", () => {
  it("debounces rapid changes and requests only the final valid coordinates", async () => {
    vi.mocked(fetchCoordinateMetadata).mockResolvedValue(METADATA);
    render(<QueryPortalCard onSubmitQuery={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("RA"), { target: { value: "83" } });
    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: "83.82" },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: "-5.39" },
    });
    expect(fetchCoordinateMetadata).not.toHaveBeenCalled();
    await debounce();
    expect(fetchCoordinateMetadata).toHaveBeenCalledExactlyOnceWith(
      "83.82",
      "-5.39",
      expect.any(AbortSignal)
    );
    expect(
      screen.getByLabelText("Available coordinate metadata")
    ).toHaveTextContent("Orion");
  });

  it("does not request metadata for invalid coordinates", async () => {
    render(
      <QueryPortalCard
        initialValues={{ ...INITIAL, dec: "91" }}
        onSubmitQuery={vi.fn()}
      />
    );
    await debounce();
    expect(fetchCoordinateMetadata).not.toHaveBeenCalled();
  });

  it("aborts obsolete requests and ignores their late responses", async () => {
    let resolveOld!: (data: CoordinateMetadata) => void;
    vi.mocked(fetchCoordinateMetadata)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        })
      )
      .mockResolvedValueOnce({ ...METADATA, targetName: "New target" });
    render(<QueryPortalCard initialValues={INITIAL} onSubmitQuery={vi.fn()} />);
    const oldSignal = vi.mocked(fetchCoordinateMetadata).mock.calls[0][2];
    fireEvent.change(screen.getByLabelText("RA"), { target: { value: "84" } });
    await debounce();
    expect(oldSignal?.aborted).toBe(true);
    expect(
      screen.getByLabelText("Available coordinate metadata")
    ).toHaveTextContent("New target");
    await act(async () => {
      resolveOld(METADATA);
    });
    expect(
      screen.getByLabelText("Available coordinate metadata")
    ).toHaveTextContent("New target");
    expect(fetchCoordinateMetadata).toHaveBeenCalledTimes(2);
  });

  it("aborts an outstanding request when unmounted", () => {
    vi.mocked(fetchCoordinateMetadata).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(
      <QueryPortalCard initialValues={INITIAL} onSubmitQuery={vi.fn()} />
    );
    const signal = vi.mocked(fetchCoordinateMetadata).mock.calls[0][2];
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("recovers from a failed lookup when Retry is clicked", async () => {
    vi.mocked(fetchCoordinateMetadata)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(METADATA);
    await act(async () => {
      render(
        <QueryPortalCard initialValues={INITIAL} onSubmitQuery={vi.fn()} />
      );
    });
    expect(
      screen.getByText("No observation dates found in preview.")
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(
      screen.getByLabelText("Available coordinate metadata")
    ).toHaveTextContent("Orion");
    expect(screen.getByLabelText("Observation Date")).toBeEnabled();
    expect(fetchCoordinateMetadata).toHaveBeenCalledTimes(2);
  });
});
