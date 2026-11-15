import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("Astro Earth Portal", () => {
  it("renders navbar links and the four portal query inputs", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Astro Earth" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/daviddrdz/astro-sentinella"
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

  it("displays available metadata automatically from coordinates without clicking Query", () => {
    render(<App />);

    expect(
      screen.queryByLabelText("Available coordinate metadata")
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: "05h 35m 17s" },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: "-05° 23' 28\"" },
    });

    const metadataPanel = screen.getByLabelText(
      "Available coordinate metadata"
    );
    expect(metadataPanel).toBeInTheDocument();
    expect(metadataPanel).toHaveTextContent("M42 | Orion Nebula");
    expect(metadataPanel).toHaveTextContent("Ha | OIII | IR | UV");
    expect(metadataPanel).toHaveTextContent("12 frames");
  });

  it("validates fields on submit and focuses the first invalid input", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    const raInput = screen.getByLabelText("RA");
    expect(raInput).toHaveAttribute("aria-invalid", "true");
    expect(raInput).toHaveFocus();
    expect(
      screen.getByText("Enter Right Ascension (e.g. 05h 35m 17s).")
    ).toBeInTheDocument();
  });

  it("transitions to Explorer on valid submission and allows returning to Portal", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("RA"), {
      target: { value: "05h 35m 17s" },
    });
    fireEvent.change(screen.getByLabelText("Dec"), {
      target: { value: "-05° 23' 28\"" },
    });
    fireEvent.change(screen.getByLabelText("Field Size (deg)"), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Observation Date"), {
      target: { value: "2026-10-12" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Query" }));

    expect(
      screen.getByRole("heading", { name: "Explorer" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("05h 35m 17s | -05° 23' 28\" | 0.5 deg | 2026-10-12")
        .length
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
